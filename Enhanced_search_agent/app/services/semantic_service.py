"""
Semantic Scholar Service
  - search_papers_semantic(): returns Paper objects from a query (used in hybrid search)
  - enrich_paper(): adds citation counts / field tags to an existing Paper
"""
import sys

import requests

from app.core.config import settings
from app.schemas.paper import Paper


class SemanticService:
    BASE_URL = "https://api.semanticscholar.org/graph/v1"

    FIELDS = "title,abstract,authors,year,citationCount,url,externalIds,fieldsOfStudy,influentialCitationCount"

    def __init__(self):
        self.headers = {}
        if settings.SEMANTIC_SCHOLAR_API_KEY:
            self.headers["x-api-key"] = settings.SEMANTIC_SCHOLAR_API_KEY

    # ------------------------------------------------------------------
    # Search  →  list[Paper]
    # ------------------------------------------------------------------

    def search_papers_semantic(self, query: str, limit: int = 5) -> list[Paper]:
        """Full search: returns normalised Paper objects from Semantic Scholar."""
        raw = self._fetch_search(query, limit)
        papers = []
        for item in raw:
            p = self._normalize(item)
            if p:
                papers.append(p)
        return papers

    # ------------------------------------------------------------------
    # Enrichment of an existing Paper object
    # ------------------------------------------------------------------

    def enrich_paper(self, paper: Paper) -> Paper:
        """Adds citation count and topic tags to an existing Paper in-place."""
        try:
            results = self._fetch_search(paper.title, limit=1)
            if not results:
                return paper
            match = results[0]
            paper.citations = match.get("citationCount") or 0
            paper.topic_tags = match.get("fieldsOfStudy") or []
            paper.influential_score = float(match.get("influentialCitationCount") or 0)
        except Exception as e:
            print(f"[SemanticService] enrich_paper failed for '{paper.title}': {e}", file=sys.stderr)
        return paper

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _fetch_search(self, query: str, limit: int) -> list[dict]:
        url = f"{self.BASE_URL}/paper/search"
        params = {
            "query": query,
            "limit": limit,
            "fields": self.FIELDS,
        }
        try:
            response = requests.get(url, params=params, headers=self.headers, timeout=20)
            response.raise_for_status()
            return response.json().get("data", [])
        except Exception as e:
            print(f"[SemanticService] API request failed: {e}", file=sys.stderr)
            return []

    def _normalize(self, item: dict) -> Paper | None:
        """Convert a Semantic Scholar result dict to a Paper dataclass."""
        title = item.get("title", "").strip()
        if not title:
            return None

        paper_id = item.get("paperId") or item.get("externalIds", {}).get("ArXiv", "") or title[:30]
        abstract = item.get("abstract") or ""
        authors = [a.get("name", "") for a in (item.get("authors") or [])]
        year = item.get("year")
        published_date = str(year) if year else ""
        citations = item.get("citationCount") or 0
        influential = float(item.get("influentialCitationCount") or 0)
        fields = item.get("fieldsOfStudy") or []

        # Build URL: prefer ArXiv PDF if available
        ext_ids = item.get("externalIds") or {}
        arxiv_id = ext_ids.get("ArXiv")
        url = (
            f"https://arxiv.org/pdf/{arxiv_id}"
            if arxiv_id
            else item.get("url") or f"https://www.semanticscholar.org/paper/{paper_id}"
        )

        return Paper(
            id=str(paper_id),
            title=title,
            abstract=abstract.replace("\n", " "),
            authors=authors,
            published_date=published_date,
            source="semantic_scholar",
            url=url,
            citations=citations,
            influential_score=influential,
            keywords=[],
            institution_names=[],
            topic_tags=fields,
        )
