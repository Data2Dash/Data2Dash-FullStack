import json
import requests
import re
from typing import List, Dict, Any
from langchain_core.prompts import ChatPromptTemplate
from .model_router import get_groq_llm

class CitationAgent:
    def __init__(self, groq_api_key: str):
        self.llm = get_groq_llm(
            preferred_model="llama-3.1-8b-instant",
            temperature=0.0,
            groq_api_key=groq_api_key,
        )

    def search_semantic_scholar(self, sentence: str) -> List[Dict[str, Any]]:
        print(f"[CitationAgent] Received search request for sentence: '{sentence}'")
        # Extract best search phrase using JSON mode to stay safe on versioning
        system_prompt = (
            "You are an expert academic assistant. Extract the core technical keywords and "
            "research concepts from the following sentence that would be ideal for searching a research database like Semantic Scholar. "
            "Keep it concise (3-6 words). "
            "Respond strictly in JSON format with a single key 'query'."
        )

        try:
            prompt = ChatPromptTemplate.from_messages([
                ("system", system_prompt),
                ("user", "{sentence}")
            ])
            chain = prompt | self.llm
            result = chain.invoke({"sentence": sentence})

            # Use regex to find JSON block in case there's conversational filler
            response_text = result.content.strip()
            json_match = re.search(r"\{.*\}", response_text, re.DOTALL)
            if json_match:
                parsed = json.loads(json_match.group(0))
                llm_query = parsed.get("query", sentence[:50])
            else:
                llm_query = sentence[:50]
        except Exception as e:
            print(f"[CitationAgent] Error parsing LLM query: {e}")
            llm_query = sentence[:50]

        print(f"[CitationAgent] LLM formulated query: '{llm_query}'")

        def fetch_from_arxiv(search_query: str) -> List[Dict[str, Any]]:
            try:
                import arxiv
                import datetime
                client = arxiv.Client()
                search = arxiv.Search(
                    query=search_query,
                    max_results=8,
                    sort_by=arxiv.SortCriterion.Relevance
                )
                results = []
                for result in client.results(search):
                    year = result.published.year if result.published else datetime.datetime.now().year
                    results.append({
                        "id": result.entry_id.split('/')[-1] if result.entry_id else "",
                        "title": result.title or "Unknown Title",
                        "authors": [a.name for a in result.authors],
                        "year": str(year),
                        "url": result.pdf_url or result.entry_id,
                        "doi": result.doi or ""
                    })
                return results
            except Exception as e:
                print(f"[CitationAgent] ArXiv error for query '{search_query}': {e}")
                return []

        # Helper to call Semantic Scholar
        def fetch_papers(search_query: str) -> List[Dict[str, Any]]:
            url = "https://api.semanticscholar.org/graph/v1/paper/search"
            params = {
                "query": search_query,
                "limit": 8,
                "fields": "title,authors,year,url,externalIds"
            }
            try:
                response = requests.get(url, params=params, timeout=15)
                response.raise_for_status()
                data = response.json()
                papers = data.get("data", [])
                if not papers:
                    return fetch_from_arxiv(search_query)

                # Format nicely
                formatted_papers = []
                for p in papers:
                    authors = [a.get("name") for a in p.get("authors", [])]
                    doi = p.get("externalIds", {}).get("DOI", "")

                    paper_url = p.get("url")
                    if not paper_url and doi:
                        paper_url = f"https://doi.org/{doi}"

                    formatted_papers.append({
                        "id": p.get("paperId", ""),
                        "title": p.get("title", "Unknown Title"),
                        "authors": authors,
                        "year": str(p.get("year", "Unknown")),
                        "url": paper_url,
                        "doi": doi
                    })
                return formatted_papers
            except Exception as e:
                print(f"[CitationAgent] Semantic Scholar error for query '{search_query}': {e}")
                print(f"[CitationAgent] Falling back to ArXiv for query '{search_query}'...")
                return fetch_from_arxiv(search_query)

        # Phase 1: Search using LLM-extracted technical keywords
        papers = fetch_papers(llm_query)

        # Phase 2: Fallback if first search yields no results
        if not papers:
            print(f"[CitationAgent] LLM query '{llm_query}' returned 0 results. Trying fallback...")
            # Create a fallback query using words from the original sentence
            clean_sentence = re.sub(r'[^\w\s]', '', sentence)
            words = clean_sentence.split()
            # Remove common stop words for fallback if possible, or just take first 8 useful words
            stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'about', 'of', 'this', 'that', 'it', 'is', 'are', 'was', 'were', 'be', 'been'}
            important_words = [w for w in words if w.lower() not in stop_words]
            fallback_query = " ".join(important_words[:6])

            if fallback_query and fallback_query.lower() != llm_query.lower():
                print(f"[CitationAgent] Fallback query: '{fallback_query}'")
                papers = fetch_papers(fallback_query)

        print(f"[CitationAgent] Found {len(papers)} papers total")
        return papers

    def format_citation(self, title: str, authors: List[str], year: str, url: str) -> Dict[str, str]:
        system_prompt = (
            "Format this academic paper metadata into strict APA (7th), MLA (9th), Chicago, and BibTeX citation strings. "
            "Respond strictly in JSON format with keys: 'apa', 'mla', 'chicago', 'bibtex'."
        )
        user_prompt = f"Title: {title}\nAuthors: {', '.join(authors)}\nYear: {year}\nURL: {url}"

        try:
            prompt = ChatPromptTemplate.from_messages([
                ("system", system_prompt),
                ("user", "{user_prompt}")
            ])
            chain = prompt | self.llm
            result = chain.invoke({"user_prompt": user_prompt})

            response_text = result.content.strip()
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]

            parsed = json.loads(response_text)

            return {
                "apa": parsed.get("apa", ""),
                "mla": parsed.get("mla", ""),
                "chicago": parsed.get("chicago", ""),
                "bibtex": parsed.get("bibtex", ""),
                "source": title[:30] + "..."
            }
        except Exception as e:
            print(f"Error formatting citation: {e}")
            authors_str = ", ".join(authors) if authors else "Unknown"
            return {
                "apa": f"{authors_str}. ({year}). {title}. {url}",
                "mla": f'{authors_str}. "{title}". {year}. {url}',
                "chicago": f"{authors_str}. \"{title}.\" ({year}). {url}",
                "bibtex": f"@article{{ref,\n title={{{title}}},\n author={{{authors_str}}},\n year={{{year}}},\n url={{{url}}}\n}}",
                "source": title[:30] + "..."
            }
