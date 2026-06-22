import os
import re
import math
import requests
import concurrent.futures
from langchain_groq import ChatGroq
from langchain_community.tools import ArxivQueryRun, WikipediaQueryRun, DuckDuckGoSearchRun
from langchain_community.utilities import WikipediaAPIWrapper
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
import arxiv
from collections import defaultdict, Counter
from typing import List, Dict, Optional
from datetime import datetime, timedelta
from .model_router import get_groq_llm


class SearchAgent:
    def __init__(self, groq_api_key: str = None):
        if not groq_api_key:
            groq_api_key = os.getenv("GROQ_API_KEY")
        self.llm = get_groq_llm(preferred_model="llama-3.1-8b-instant", temperature=0, groq_api_key=groq_api_key)
        api_wrapper_wiki = WikipediaAPIWrapper(top_k_results=2, doc_content_chars_max=1500)
        self.wiki = WikipediaQueryRun(api_wrapper=api_wrapper_wiki)
        self.arxiv_tool = ArxivQueryRun()
        self.search = DuckDuckGoSearchRun()
        self.tools = {
            "Wikipedia": {"tool": self.wiki,        "description": "Good for factual info, background knowledge and general concepts."},
            "Arxiv":     {"tool": self.arxiv_tool,  "description": "Good for scientific papers, latest research and technical details."},
            "Search":    {"tool": self.search,      "description": "Good for current events, news or general web search."},
        }

    # ── Scoring helpers ──────────────────────────────────────────────────────

    _STOPWORDS = {
        "the","a","an","in","of","and","or","for","to","with","on","is","are","was",
        "were","be","been","by","as","at","from","that","this","which","we","our",
        "their","has","have","had","using","based","via","through","can","also",
    }

    def _tokenize(self, text: str) -> set:
        return {t for t in re.findall(r"[a-z0-9]+", text.lower())
                if t not in self._STOPWORDS and len(t) > 2}

    def _semantic_score(self, query: str, title: str, abstract: str) -> float:
        q = self._tokenize(query)
        if not q:
            return 0.5
        t_overlap = len(q & self._tokenize(title))
        a_overlap = len(q & self._tokenize(abstract))
        score = (t_overlap * 3 + a_overlap) / max(len(q) * 4, 1)
        if t_overlap > 0:
            score = min(1.0, score + 0.15)
        return round(min(1.0, score), 4)

    def _topic_score(self, query: str, tags: List[str], keywords: List[str]) -> float:
        q = self._tokenize(query)
        if not q:
            return 0.5
        tag_tokens = {w for t in (tags + keywords) for w in re.findall(r"[a-z0-9]+", t.lower())}
        return round(min(1.0, len(q & tag_tokens) / len(q)), 4)

    def _normalize_title(self, t: str) -> str:
        return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", "", t.lower())).strip()

    # ── OpenAlex: query-level search (fast, single request) ─────────────────

    def _fetch_openalex_for_query(self, query: str, per_page: int = 200) -> List[Dict]:
        """
        Search OpenAlex with the user query (not per-title).
        Returns rich paper objects sorted by citation count.
        Default 200 results. Tune via OPENALEX_MAX_RESULTS.
        """
        email   = os.getenv("OPENALEX_MAILTO", "research@data2dash.ai")
        headers = {"User-Agent": f"Data2Dash/1.0 (mailto:{email})"}
        papers  = []
        cursor  = "*"
        fetched = 0
        target  = min(per_page, 500)  # hard cap — keep requests fast

        while fetched < target:
            batch = min(200, target - fetched)
            params = {
                "search":   query,
                "per-page": batch,
                "cursor":   cursor,
                "select":   "id,title,cited_by_count,publication_year,primary_location,"
                            "concepts,authorships,doi,open_access",
            }
            try:
                r = requests.get(
                    "https://api.openalex.org/works",
                    params=params, headers=headers, timeout=10,
                )
                if r.status_code != 200:
                    break
                data    = r.json()
                results = data.get("results", [])
                if not results:
                    break

                for item in results:
                    loc    = (item.get("primary_location") or {})
                    src    = (loc.get("source") or {})
                    venue  = src.get("display_name")
                    concepts = [c["display_name"] for c in item.get("concepts", [])
                                if c.get("level", 99) <= 2]
                    authors  = [a.get("author", {}).get("display_name", "")
                                for a in item.get("authorships", [])]
                    doi      = item.get("doi") or ""
                    # Build an arXiv URL from DOI if it looks like one
                    url = ""
                    if "arxiv" in doi.lower():
                        arxiv_id = doi.split("arxiv.")[-1].strip("/")
                        url = f"https://arxiv.org/abs/{arxiv_id}"

                    papers.append({
                        "_norm_title":   self._normalize_title(item.get("title") or ""),
                        "id":            item.get("id", "").split("/")[-1],
                        "title":         item.get("title") or "",
                        "abstract":      "",
                        "authors":       ", ".join(authors),
                        "authors_list":  authors,
                        "date":          str(item.get("publication_year") or ""),
                        "published_date": f"{item.get('publication_year') or ''}-01-01",
                        "source":        "openalex",
                        "url":           url or doi,
                        "pdf_url":       item.get("open_access", {}).get("oa_url") or "",
                        "arxiv_id":      None,
                        "openalex_work_id": item.get("id"),
                        "citations":     item.get("cited_by_count") or 0,
                        "influential_score": 0,
                        "keywords":      [],
                        "topic_tags":    concepts[:5],
                        "inferred_topic_tags": [],
                        "venue":         venue,
                    })

                fetched += len(results)
                cursor   = data.get("meta", {}).get("next_cursor")
                if not cursor:
                    break
            except Exception:
                break

        return papers

    # ── ArXiv: unlimited fetch ───────────────────────────────────────────────

    def _fetch_arxiv(self, query: str, max_results: int = 300) -> List[Dict]:
        """Fetch papers from ArXiv. Default 300 — thorough search. Tune via ARXIV_MAX_RESULTS."""
        papers = []
        try:
            client = arxiv.Client(num_retries=2, page_size=100)
            search = arxiv.Search(
                query=query,
                max_results=max_results,
                sort_by=arxiv.SortCriterion.Relevance,
            )
            for i, r in enumerate(client.results(search)):
                papers.append({
                    "_norm_title":   self._normalize_title(r.title),
                    "_arxiv_rank":   i,
                    "id":            r.entry_id.split("/")[-1],
                "title":         r.title,
                "abstract":      r.summary.replace("\n", " "),
                "authors":       ", ".join(a.name for a in r.authors),
                "authors_list":  [a.name for a in r.authors],
                "date":          r.published.strftime("%Y-%m-%d"),
                "published_date": r.published.strftime("%Y-%m-%d"),
                "source":        "arxiv",
                "url":           r.pdf_url or r.entry_id,
                "pdf_url":       r.pdf_url,
                "arxiv_id":      r.entry_id.split("/")[-1],
                "openalex_work_id": None,
                "citations":     0,
                "influential_score": 0,
                "keywords":      [],
                "topic_tags":    [],
                "inferred_topic_tags": [],
                "venue":         None,
            })
        except Exception as e:
            print(f"[search] ArXiv fetch error: {e}")
        return papers

    # ── Merge ArXiv + OpenAlex ───────────────────────────────────────────────

    def _merge_results(self, arxiv_papers: List[Dict], oa_papers: List[Dict]) -> List[Dict]:
        """
        Merge ArXiv and OpenAlex results.
        - If an ArXiv paper matches an OpenAlex paper (by normalized title), enrich it.
        - Unmatched OpenAlex papers with abstracts are added as standalone entries.
        """
        # Index OpenAlex by normalized title
        oa_by_title: Dict[str, Dict] = {p["_norm_title"]: p for p in oa_papers}

        merged   = []
        seen     = set()

        for p in arxiv_papers:
            norm = p["_norm_title"]
            seen.add(norm)
            oa = oa_by_title.get(norm)
            if oa:
                # Enrich ArXiv paper with OpenAlex data
                p["citations"]        = oa["citations"]
                p["topic_tags"]       = oa["topic_tags"] or p["topic_tags"]
                p["venue"]            = oa["venue"]
                p["openalex_work_id"] = oa["openalex_work_id"]
                if oa["authors_list"]:
                    p["authors_list"] = oa["authors_list"]
                    p["authors"]      = oa["authors"]
                p["source"] = "arxiv,openalex"
            merged.append(p)

        # Add OpenAlex-only papers not already in ArXiv
        for p in oa_papers:
            if p["_norm_title"] not in seen:
                seen.add(p["_norm_title"])
                p["source"] = "openalex"
                merged.append(p)

        return merged

    # ── Analytics ───────────────────────────────────────────────────────────

    def _build_analytics(self, papers: List[Dict], query: str) -> Dict:
        now_year  = datetime.now().year
        year_dist: Counter = Counter()
        src_dist:  Counter = Counter()
        kw_counter: Counter = Counter()
        author_papers: Dict[str, List] = defaultdict(list)

        for p in papers:
            y = str(p.get("published_date", "")[:4])
            if y.isdigit():
                year_dist[y] += 1
            for src in (p.get("source", "")).split(","):
                s = src.strip().lower()
                if s:
                    src_dist[s] += 1
            for kw in p.get("topic_tags", []) + p.get("inferred_topic_tags", []) + p.get("keywords", []):
                if kw:
                    kw_counter[kw.strip()] += 1
            for a in p.get("authors_list", []):
                if a:
                    author_papers[a].append(p)

        top_author_impact = []
        for author, plist in sorted(author_papers.items(), key=lambda x: -len(x[1]))[:10]:
            total_cites = sum(pp.get("citations", 0) for pp in plist)
            impact = len(plist) * 0.5 + math.log1p(total_cites) * 0.5
            top_author_impact.append({
                "author": author, "paper_count": len(plist),
                "citations": total_cites, "impact_score": round(impact, 2),
            })
        top_author_impact.sort(key=lambda x: -x["impact_score"])

        top_cited_papers = [
            {
                "title":    p["title"],
                "citations": p.get("citations", 0) or 0,
                "url":      p.get("url", ""),
                "year":     str(p.get("published_date", "")[:4]),
                "authors":  p.get("authors_list", []),
                "source":   p.get("source", ""),
                "venue":    p.get("venue") or "",
                "subtopics": p.get("topic_tags", [])[:3],
            }
            for p in sorted(papers, key=lambda p: -(p.get("citations") or 0))[:10]
        ]

        cutoff      = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        recent_cnt  = sum(1 for p in papers if (p.get("published_date") or "") >= cutoff)
        all_cites   = [p.get("citations", 0) or 0 for p in papers]
        avg_cites   = round(sum(all_cites) / max(len(all_cites), 1), 1)
        max_cites   = max(all_cites) if all_cites else 0

        recent_vol = sum(year_dist[str(y)] for y in range(now_year - 2, now_year + 1) if str(y) in year_dist)
        older_vol  = sum(v for y, v in year_dist.items() if y.isdigit() and int(y) < now_year - 2)
        if recent_vol > older_vol * 0.6:
            trend = "Rising (active research area)"
        elif recent_vol < older_vol * 0.3:
            trend = "Declining"
        else:
            trend = "Stable"

        top_authors = [
            (a, len(plist))
            for a, plist in sorted(author_papers.items(), key=lambda x: -len(x[1]))[:10]
        ]

        return {
            "total_papers":         len(papers),
            "papers_last_30_days":  recent_cnt,
            "avg_citations":        avg_cites,
            "max_citations":        max_cites,
            "trend_status":         trend,
            "top_keywords":         kw_counter.most_common(15),
            "top_authors":          top_authors,
            "source_distribution":  dict(src_dist),
            "year_distribution":    dict(sorted(year_dist.items())),
            "subtopic_distribution": dict(kw_counter.most_common(10)),
            "field_distribution":   dict(kw_counter.most_common(8)),
            "venue_distribution":   {},
            "year_subtopic_trends": {},
            "top_author_impact":    top_author_impact[:7],
            "top_cited_papers":     top_cited_papers[:5],
            "llm_insight": (
                f"Found {len(papers)} papers on '{query}'. "
                f"The field shows {trend.lower()} publication activity. "
                f"Average citations: {avg_cites:.1f}. "
                + (f"Key topics: {', '.join(list(kw_counter)[:5])}." if kw_counter else "")
            ),
        }

    # ── Main search ──────────────────────────────────────────────────────────

    def search_academic_papers(self, query: str, page: int = 1, per_page: int = 25) -> Dict:
        """
        Hybrid search: ArXiv (full fetch) + OpenAlex (query-level, concurrent).
        ArXiv has no artificial cap — fetches up to 300 results by default.
        OpenAlex runs in parallel and enriches/extends results.
        """
        try:
            ARXIV_MAX = int(os.getenv("ARXIV_MAX_RESULTS", "300"))
            OA_MAX    = int(os.getenv("OPENALEX_MAX_RESULTS", "200"))

            # Fetch both sources concurrently
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
                arxiv_future = ex.submit(self._fetch_arxiv, query, ARXIV_MAX)
                oa_future    = ex.submit(self._fetch_openalex_for_query, query, OA_MAX)
                arxiv_papers = arxiv_future.result()
                oa_papers    = oa_future.result()

            print(f"[search] ArXiv: {len(arxiv_papers)} | OpenAlex: {len(oa_papers)}")

            # Merge (enrich ArXiv with OA data, add OA-only papers)
            all_papers = self._merge_results(arxiv_papers, oa_papers)

            n_arxiv = len(arxiv_papers)

            # Score every paper
            for p in all_papers:
                arxiv_rank = p.pop("_arxiv_rank", None)
                p.pop("_norm_title", None)

                sem   = self._semantic_score(query, p["title"], p.get("abstract", ""))
                topic = self._topic_score(query, p.get("topic_tags", []), p.get("keywords", []))

                pos_score = (
                    max(0.0, 1.0 - arxiv_rank / max(n_arxiv, 1))
                    if arxiv_rank is not None else 0.0
                )
                cit_norm  = min(1.0, math.log1p(p.get("citations", 0)) / 10.0)
                hybrid    = round(0.40 * sem + 0.20 * topic + 0.25 * pos_score + 0.15 * cit_norm, 4)

                p["semantic_score"]         = sem
                p["topic_relevance_score"]  = topic
                p["hybrid_relevance_score"] = hybrid
                p["ranking_reasons"]        = {
                    "semantic": sem, "topic": topic,
                    "position": round(pos_score, 4),
                    "citations": cit_norm, "composite": hybrid,
                }

                # Infer tags from abstract
                if p.get("abstract"):
                    freq = Counter(
                        w.lower() for w in re.findall(r"\b[A-Za-z][a-z]{3,}\b", p["abstract"])
                    )
                    skip = {"that","with","this","from","have","been","they","which","their","also","such"}
                    p["inferred_topic_tags"] = [w for w, _ in freq.most_common(10) if w not in skip][:5]

            # Sort by hybrid score
            all_papers.sort(key=lambda p: -p["hybrid_relevance_score"])

            analytics = self._build_analytics(all_papers, query)

            offset     = (page - 1) * per_page
            page_slice = all_papers[offset: offset + per_page]

            src_counts = Counter()
            for p in all_papers:
                for s in p.get("source", "").split(","):
                    src_counts[s.strip()] += 1

            return {
                "query":            query,
                "expanded_queries": [query],
                "semantic_keywords": list({w for p in all_papers for w in p.get("topic_tags", [])})[:10],
                "total_found":      len(all_papers),
                "source_counts":    dict(src_counts),
                "result_accounting": {
                    "retrieved_count":    len(arxiv_papers) + len(oa_papers),
                    "deduplicated_count": len(all_papers),
                    "filtered_count":     len(all_papers),
                    "final_ranked_count": len(all_papers),
                },
                "ranked_papers": all_papers,
                "papers":        page_slice,
                "total":         len(all_papers),
                "page":          page,
                "per_page":      per_page,
                "has_more":      (offset + per_page) < len(all_papers),
                "analytics":     analytics,
            }

        except Exception as e:
            print(f"[search] error: {e}")
            import traceback; traceback.print_exc()
            return {
                "query": query, "expanded_queries": [], "semantic_keywords": [],
                "total_found": 0, "source_counts": {}, "result_accounting": {},
                "ranked_papers": [], "papers": [], "total": 0,
                "page": page, "per_page": per_page, "has_more": False,
                "analytics": {},
            }

    # ── Agentic chat search (/api/search) ────────────────────────────────────

    def _get_system_prompt(self):
        tools_desc = "\n".join([f"- {name}: {info['description']}" for name, info in self.tools.items()])
        return f"""You are a research assistant for AI, Machine Learning, and Data Science topics.

Available tools:
{tools_desc}

Respond with ONE action step at a time using EXACTLY this format:

Thought: [why you chose this tool]
Action: [Wikipedia | Arxiv | Search]
Action Input: [your search query]

After the Observation is returned, give your final answer:
Thought: [summary of what you found]
Final Answer: [comprehensive answer — cite ONLY information from the tool Observation]

RULES:
- Do NOT pre-generate Observation lines — wait for real tool results
- Action must be EXACTLY one of: Wikipedia, Arxiv, Search
- Always use at least one tool before giving a Final Answer
- Your Final Answer MUST be based on the Observation — do NOT add facts from your training data
- If the tool result is insufficient, say so honestly — do NOT speculate or fill gaps from memory
- For math: use $$...$$ for display equations and $...$ for inline math (LaTeX notation)

Begin!"""

    def run(self, query: str, callbacks=None) -> Dict:
        """Agentic chat search for the /api/search endpoint."""
        try:
            messages = [
                SystemMessage(content=self._get_system_prompt()),
                HumanMessage(content=f"Question: {query}\n\nRespond with ONE action step only.")
            ]
            sources    = []
            history    = []
            tools_used = 0

            for _ in range(6):
                response      = self.llm.invoke(messages)
                response_text = response.content

                has_final = bool(re.search(r"Final Answer:", response_text, re.IGNORECASE))
                action_m  = re.search(r"Action:\s*(\w+)", response_text, re.IGNORECASE)
                input_m   = re.search(
                    r"Action Input:\s*(.+?)(?=\nObservation:|\nThought:|\nFinal Answer:|$)",
                    response_text, re.DOTALL | re.IGNORECASE
                )

                if action_m and input_m:
                    tool_name  = action_m.group(1).strip()
                    tool_input = input_m.group(1).strip().strip("[]")
                    history.append(("ai", f"Action: {tool_name} | {tool_input}"))

                    if tool_name in self.tools:
                        try:
                            obs = self.tools[tool_name]["tool"].run(tool_input)
                            tools_used += 1
                            sources.append(f"{tool_name}: {tool_input}")
                            history.append(("human", f"Observation: {obs[:300]}"))

                            if has_final:
                                fm = re.search(r"Final Answer:\s*(.+)", response_text, re.DOTALL | re.IGNORECASE)
                                return {"response": (fm.group(1).strip() if fm else response_text), "sources": list(set(sources)), "history": history}

                            messages.append(AIMessage(content=response_text))
                            messages.append(HumanMessage(content=f"Observation: {obs}\n\nNow give your Final Answer."))
                        except Exception as e:
                            messages.append(AIMessage(content=response_text))
                            messages.append(HumanMessage(content=f"Tool error: {e}. Try a different query."))
                            if has_final:
                                fm = re.search(r"Final Answer:\s*(.+)", response_text, re.DOTALL | re.IGNORECASE)
                                if fm:
                                    return {"response": fm.group(1).strip(), "sources": list(set(sources)), "history": history}
                    else:
                        messages.append(AIMessage(content=response_text))
                        messages.append(HumanMessage(content=f"Unknown tool '{tool_name}'. Use: {', '.join(self.tools)}"))

                elif has_final:
                    if tools_used == 0:
                        messages.append(AIMessage(content=response_text))
                        messages.append(HumanMessage(content="You must use a tool first. Use Action: / Action Input: format."))
                        continue
                    fm = re.search(r"Final Answer:\s*(.+)", response_text, re.DOTALL | re.IGNORECASE)
                    return {"response": (fm.group(1).strip() if fm else response_text), "sources": list(set(sources)), "history": history}

                else:
                    if tools_used > 0:
                        return {"response": response_text.strip(), "sources": list(set(sources)), "history": history}
                    messages.append(AIMessage(content=response_text))
                    messages.append(HumanMessage(content="Use Action: / Action Input: format to call a tool."))

            # Fallback synthesis
            if tools_used > 0:
                messages.append(HumanMessage(content=f"Summarize what you found and give a Final Answer to: {query}"))
                resp = self.llm.invoke(messages)
                ans  = resp.content.strip()
                fm   = re.search(r"Final Answer:\s*(.+)", ans, re.DOTALL | re.IGNORECASE)
                return {"response": (fm.group(1).strip() if fm else ans), "sources": list(set(sources)), "history": history}

            return {"response": "Could not find relevant information. Please rephrase your question.", "sources": [], "history": history}

        except Exception as e:
            return {"response": f"Error: {e}", "sources": [], "history": []}