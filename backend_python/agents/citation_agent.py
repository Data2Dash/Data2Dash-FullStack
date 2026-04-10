import json
import requests
from typing import List, Dict, Any
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate

class CitationAgent:
    def __init__(self, groq_api_key: str):
        self.llm = ChatGroq(
            groq_api_key=groq_api_key,
            model_name="llama-3.1-8b-instant",
            temperature=0.0
        )

    def search_semantic_scholar(self, sentence: str) -> List[Dict[str, Any]]:
        # Extract best search phrase using JSON mode to stay safe on versioning
        system_prompt = (
            "You are an expert academic assistant. Extract a highly unique 4-to-5 word phrase "
            "from the following sentence that would be ideal for searching a research database like Semantic Scholar. "
            "Respond strictly in JSON format with a single key 'query'."
        )
        
        try:
            prompt = ChatPromptTemplate.from_messages([
                ("system", system_prompt),
                ("user", "{sentence}")
            ])
            chain = prompt | self.llm
            result = chain.invoke({"sentence": sentence})
            
            # Clean up response to handle possible markdown wrappers
            response_text = result.content.strip()
            if response_text.startswith("```json"):
                response_text = response_text[7:]
            if response_text.endswith("```"):
                response_text = response_text[:-3]
                
            parsed = json.loads(response_text)
            query = parsed.get("query", sentence[:50])
        except Exception as e:
            print(f"Error parsing query: {e}")
            query = sentence[:50]
            
        # Hit Semantic Scholar
        url = "https://api.semanticscholar.org/graph/v1/paper/search"
        params = {
            "query": query,
            "limit": 5,
            "fields": "title,authors,year,url,externalIds"
        }
        
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            papers = data.get("data", [])
            
            # Format nicely
            formatted_papers = []
            for p in papers:
                authors = [a.get("name") for a in p.get("authors", [])]
                doi = p.get("externalIds", {}).get("DOI", "")
                
                # In case URL is empty but DOI exists
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
            print(f"Semantic Scholar error: {e}")
            return []

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
