"""
Enhanced Search Agent Adapter
==============================
Bridges the FastAPI backend to the Enhanced Hybrid Search Agent located at
``Enhanced_search_agent/``. Adds the package to sys.path on first import so
no files need to be duplicated.
"""
from __future__ import annotations

import os
import sys
from dataclasses import asdict
from typing import Any, Dict, List, Optional

# ── Locate and register the Enhanced_search_agent package ────────────────────
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_BACKEND_DIR = os.path.dirname(_THIS_DIR)
_PROJECT_ROOT = os.path.dirname(_BACKEND_DIR)
_ENHANCED_DIR = os.path.join(_PROJECT_ROOT, "Enhanced_search_agent")

if _ENHANCED_DIR not in sys.path:
    sys.path.insert(0, _ENHANCED_DIR)

# ── Import the Enhanced Agent components ────────────────────────────────────
from app.services.search_agent import SearchAgent as _EnhancedSearchAgent  # noqa: E402
from app.services.analytics_service import AnalyticsService                # noqa: E402


def _paper_to_dict(paper) -> Dict[str, Any]:
    """Convert an Enhanced Agent Paper dataclass to a JSON-serialisable dict."""
    try:
        d = asdict(paper)
    except Exception:
        # Fallback: manual attribute extraction
        d = {
            "id": getattr(paper, "id", ""),
            "title": getattr(paper, "title", ""),
            "abstract": getattr(paper, "abstract", ""),
            "authors": getattr(paper, "authors", []),
            "published_date": getattr(paper, "published_date", ""),
            "source": getattr(paper, "source", ""),
            "url": getattr(paper, "url", ""),
            "doi": getattr(paper, "doi", None),
            "arxiv_id": getattr(paper, "arxiv_id", None),
            "openalex_work_id": getattr(paper, "openalex_work_id", None),
            "citations": getattr(paper, "citations", 0),
            "influential_score": getattr(paper, "influential_score", 0.0),
            "keywords": getattr(paper, "keywords", []),
            "institution_names": getattr(paper, "institution_names", []),
            "topic_tags": getattr(paper, "topic_tags", []),
            "venue": getattr(paper, "venue", None),
            "semantic_score": getattr(paper, "semantic_score", 0.0),
            "topic_relevance_score": getattr(paper, "topic_relevance_score", 0.0),
            "inferred_topic_tags": getattr(paper, "inferred_topic_tags", []),
            "retrieval_path": getattr(paper, "retrieval_path", None),
            "ranking_reasons": getattr(paper, "ranking_reasons", {}),
            "bm25_score": getattr(paper, "bm25_score", 0.0),
            "embedding_score": getattr(paper, "embedding_score", 0.0),
            "hybrid_relevance_score": getattr(paper, "hybrid_relevance_score", 0.0),
        }
    # Adapt field names expected by the legacy frontend
    d["date"] = d.get("published_date", "")
    d["authors_list"] = d.get("authors", [])
    d["authors"] = ", ".join(d.get("authors_list", [])) if isinstance(d.get("authors_list"), list) else d.get("authors_list", "")
    return d


def _analytics_to_dict(analytics_obj) -> Dict[str, Any]:
    """Convert an AnalyticsSummary dataclass to a JSON-serialisable dict."""
    if analytics_obj is None:
        return {}
    try:
        raw = asdict(analytics_obj)
    except Exception:
        raw = {}
    # Ensure top_cited_papers entries include a full author list
    top_cited = raw.get("top_cited_papers") or []
    result_papers = []
    for p in top_cited:
        if isinstance(p, dict):
            result_papers.append(p)
    raw["top_cited_papers"] = result_papers
    return raw


class SearchAgent:
    """
    Public interface used by the FastAPI backend.
    Wraps the Enhanced Hybrid Search Agent and exposes:
      - search_academic_papers(query, page, per_page) -> rich dict
      - run(query)                                    -> legacy chat-style dict
    """

    def __init__(self, groq_api_key: Optional[str] = None):
        # groq_api_key is accepted for API compatibility but the Enhanced agent
        # reads it from the environment / Settings object automatically.
        if groq_api_key:
            os.environ.setdefault("GROQ_API_KEY", groq_api_key)
        self._agent = _EnhancedSearchAgent()

    # ------------------------------------------------------------------
    # Primary endpoint — rich enhanced search
    # ------------------------------------------------------------------

    def search_academic_papers(
        self,
        query: str,
        page: int = 1,
        per_page: int = 25,
    ) -> Dict[str, Any]:
        """
        Calls the Enhanced Search Agent pipeline and returns a fully-serialisable
        response dict suitable for JSON encoding by FastAPI.
        """
        raw = self._agent.search(query=query, page=page, per_page=per_page)

        # Serialise Paper dataclasses → plain dicts
        ranked_papers = [_paper_to_dict(p) for p in (raw.get("ranked_papers") or [])]
        page_papers = [_paper_to_dict(p) for p in (raw.get("papers") or [])]

        analytics = _analytics_to_dict(raw.get("analytics"))

        return {
            # Search metadata
            "query": raw.get("query", query),
            "expanded_queries": raw.get("expanded_queries", []),
            "semantic_keywords": raw.get("semantic_keywords", []),
            "topic_profile": raw.get("topic_profile", {}),

            # Counts / accounting
            "total_found": raw.get("total_found", 0),
            "source_counts": raw.get("source_counts", {}),
            "result_accounting": raw.get("result_accounting", {}),

            # Paper lists (full ranked pool + current page)
            "ranked_papers": ranked_papers,
            "papers": page_papers,

            # Pagination (backward compat fields)
            "total": raw.get("total_found", 0),
            "page": page,
            "per_page": per_page,
            "has_more": len(page_papers) == per_page,

            # Analytics
            "analytics": analytics,
        }

    # ------------------------------------------------------------------
    # Legacy endpoint — used by /api/search (AI chat-style response)
    # ------------------------------------------------------------------

    def run(self, query: str, callbacks=None) -> Dict[str, Any]:
        """
        Backward-compatible wrapper for the /api/search endpoint.
        Returns a chat-style response based on the top-ranked paper.
        """
        try:
            result = self.search_academic_papers(query, page=1, per_page=5)
            papers = result.get("papers", [])
            if papers:
                top = papers[0]
                summary = (
                    f"**{top['title']}**\n"
                    f"Authors: {top.get('authors', 'N/A')}\n"
                    f"Published: {top.get('date', 'N/A')}\n"
                    f"Citations: {top.get('citations', 0)}\n\n"
                    f"{top.get('abstract', '')}"
                )
            else:
                summary = f"No papers found for query: {query}"
            return {
                "response": summary,
                "sources": [p.get("url", "") for p in papers],
                "history": [],
            }
        except Exception as e:
            return {
                "response": f"Search error: {str(e)}",
                "sources": [],
                "history": [],
            }