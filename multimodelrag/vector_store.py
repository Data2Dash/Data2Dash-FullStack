"""
vector_store.py
===============
Unified vector store with FAISS + lexical fallback.

Compatibility goals:
- add_document(doc_id, chunks)
- search(query, top_k, chunk_type=None)
- similarity_search(query, k=5, chunk_type=None)
- hybrid_search(query, top_k, chunk_type=None, rrf_k=60)
- multi_query_hybrid_search(query_variants, top_k, chunk_type=None, rrf_k=60)
- get_all_chunks_by_type(chunk_type)
- get_chunk_by_id(chunk_id)
- registry property for exact element lookup

This implementation preserves the original RAG flow while being defensive:
- Uses SentenceTransformer when available
- Uses FAISS when available
- Falls back safely to lexical scoring when embeddings are unavailable
"""

from __future__ import annotations

import logging
import math
import re
from collections import Counter, defaultdict
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

import numpy as np

from multimodal_models import GlobalElementRegistry, MultimodalChunk, SearchResult

logger = logging.getLogger(__name__)

try:
    import faiss  # type: ignore
    HAS_FAISS = True
except Exception:
    faiss = None
    HAS_FAISS = False

try:
    from sentence_transformers import SentenceTransformer  # type: ignore
    HAS_ST = True
except Exception:
    SentenceTransformer = None
    HAS_ST = False


_WORD_RE = re.compile(r"\b[\w\-\.\(\)]+\b", re.UNICODE)


def _tokenize(text: str) -> List[str]:
    if not text:
        return []
    return [t.lower() for t in _WORD_RE.findall(text.lower()) if len(t) > 1]


# ── Singleton Embedding Model (loaded ONCE, shared across all sessions) ──────
_SHARED_EMBEDDING_MODEL = None
_SHARED_EMBEDDING_DIM = None
_SHARED_MODEL_NAME = None


def _get_shared_embedding_model(model_name: str):
    """Load embedding model once and reuse across all UnifiedVectorStore instances."""
    global _SHARED_EMBEDDING_MODEL, _SHARED_EMBEDDING_DIM, _SHARED_MODEL_NAME
    if _SHARED_EMBEDDING_MODEL is not None and _SHARED_MODEL_NAME == model_name:
        return _SHARED_EMBEDDING_MODEL, _SHARED_EMBEDDING_DIM
    if not HAS_ST:
        return None, None
    try:
        import time as _t
        t0 = _t.perf_counter()
        _SHARED_EMBEDDING_MODEL = SentenceTransformer(model_name)
        _SHARED_EMBEDDING_DIM = int(_SHARED_EMBEDDING_MODEL.get_sentence_embedding_dimension())
        _SHARED_MODEL_NAME = model_name
        print(f"[TIMING] Embedding model loaded: {model_name} ({_SHARED_EMBEDDING_DIM}d) in {_t.perf_counter()-t0:.1f}s")
        return _SHARED_EMBEDDING_MODEL, _SHARED_EMBEDDING_DIM
    except Exception as exc:
        logger.warning("Failed to load embedding model '%s': %s", model_name, exc)
        return None, None


class UnifiedVectorStore:
    def __init__(self, embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"):
        self.embedding_model_name = embedding_model
        self.registry = GlobalElementRegistry()

        self._chunks: List[MultimodalChunk] = []
        self._chunk_ids: List[str] = []
        self._chunk_id_to_index: Dict[str, int] = {}
        self._doc_to_chunk_ids: Dict[str, List[str]] = defaultdict(list)
        self._type_to_chunk_ids: Dict[str, List[str]] = defaultdict(list)

        self._embedding_model = None
        self._embedding_dim: Optional[int] = None
        self._index = None
        self._embeddings_matrix: Optional[np.ndarray] = None

        self._term_doc_freq: Counter = Counter()
        self._chunk_term_freqs: List[Counter] = []
        self._chunk_lengths: List[int] = []
        self._avg_chunk_length: float = 0.0

        self._init_embedding_backend()
        logger.info("✅ UnifiedVectorStore initialized (FAISS=%s, ST=%s)", HAS_FAISS, self._embedding_model is not None)

    # ------------------------------------------------------------------
    # Initialization
    # ------------------------------------------------------------------

    def _init_embedding_backend(self) -> None:
        """Use the singleton shared model — no per-session loading delay."""
        model, dim = _get_shared_embedding_model(self.embedding_model_name)
        self._embedding_model = model
        self._embedding_dim = dim
        if dim and HAS_FAISS:
            self._index = faiss.IndexFlatIP(dim)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def add_document(self, doc_id: str, chunks: Sequence[MultimodalChunk]) -> None:
        if not chunks:
            logger.warning("add_document called with no chunks for doc %s", doc_id)
            return

        new_chunks: List[MultimodalChunk] = []
        texts_for_embedding: List[str] = []

        for chunk in chunks:
            if not isinstance(chunk, MultimodalChunk):
                chunk = self._coerce_chunk(chunk)

            if chunk.chunk_id in self._chunk_id_to_index:
                continue

            idx = len(self._chunks)
            self._chunks.append(chunk)
            self._chunk_ids.append(chunk.chunk_id)
            self._chunk_id_to_index[chunk.chunk_id] = idx
            self._doc_to_chunk_ids[doc_id].append(chunk.chunk_id)
            self._type_to_chunk_ids[chunk.chunk_type].append(chunk.chunk_id)
            self.registry.register(doc_id, chunk)

            emb_text = self._build_embedding_text(chunk)
            chunk.embedding_text = emb_text
            texts_for_embedding.append(emb_text)
            new_chunks.append(chunk)

            tokens = _tokenize(emb_text)
            tf = Counter(tokens)
            self._chunk_term_freqs.append(tf)
            self._chunk_lengths.append(sum(tf.values()))
            for term in tf.keys():
                self._term_doc_freq[term] += 1

        if not new_chunks:
            logger.info("No new chunks were added for doc %s", doc_id)
            return

        self._avg_chunk_length = sum(self._chunk_lengths) / max(1, len(self._chunk_lengths))
        self._append_dense_embeddings(texts_for_embedding)
        logger.info("✅ Added %d chunks for doc %s", len(new_chunks), doc_id)

    def get_all_chunks_by_type(self, chunk_type: str) -> List[MultimodalChunk]:
        ids = self._type_to_chunk_ids.get(chunk_type, [])
        return [self.get_chunk_by_id(cid) for cid in ids if self.get_chunk_by_id(cid) is not None]

    def get_chunk_by_id(self, chunk_id: str) -> Optional[MultimodalChunk]:
        idx = self._chunk_id_to_index.get(chunk_id)
        if idx is None:
            return None
        return self._chunks[idx]

    def similarity_search(self, query: str, k: int = 5, chunk_type: Optional[str] = None) -> List[SearchResult]:
        dense_results = self._dense_search(query=query, top_k=k, chunk_type=chunk_type)
        if dense_results:
            return dense_results
        return self._lexical_search(query=query, top_k=k, chunk_type=chunk_type)

    def search(self, query: str, top_k: int = 5, chunk_type: Optional[str] = None) -> List[SearchResult]:
        return self.hybrid_search(query=query, top_k=top_k, chunk_type=chunk_type)

    def hybrid_search(
        self,
        query: str,
        top_k: int = 5,
        chunk_type: Optional[str] = None,
        rrf_k: int = 60,
    ) -> List[SearchResult]:
        dense = self._dense_search(query=query, top_k=max(top_k * 3, top_k), chunk_type=chunk_type)
        lexical = self._lexical_search(query=query, top_k=max(top_k * 3, top_k), chunk_type=chunk_type)
        fused = self._rrf_fuse([dense, lexical], top_k=top_k, rrf_k=rrf_k)
        if fused:
            return fused
        return dense[:top_k] or lexical[:top_k]

    def multi_query_hybrid_search(
        self,
        query_variants: Sequence[str],
        top_k: int = 5,
        chunk_type: Optional[str] = None,
        rrf_k: int = 60,
    ) -> List[SearchResult]:
        result_lists: List[List[SearchResult]] = []
        seen_queries = []
        for q in query_variants or []:
            q = (q or "").strip()
            if not q or q in seen_queries:
                continue
            seen_queries.append(q)
            result_lists.append(self.hybrid_search(query=q, top_k=max(top_k * 2, top_k), chunk_type=chunk_type, rrf_k=rrf_k))
        return self._rrf_fuse(result_lists, top_k=top_k, rrf_k=rrf_k)

    # ------------------------------------------------------------------
    # Dense search
    # ------------------------------------------------------------------

    def _append_dense_embeddings(self, texts: Sequence[str]) -> None:
        """Batch-encode texts and add to FAISS index. Processes in batches of 32
        to optimize GPU/CPU memory throughput without overwhelming the model."""
        if not texts or self._embedding_model is None:
            return

        BATCH_SIZE = 32
        all_embeddings = []

        try:
            for i in range(0, len(texts), BATCH_SIZE):
                batch = list(texts[i:i + BATCH_SIZE])
                batch_emb = self._embedding_model.encode(
                    batch,
                    convert_to_numpy=True,
                    normalize_embeddings=True,
                    show_progress_bar=False,
                    batch_size=BATCH_SIZE,
                ).astype("float32")
                all_embeddings.append(batch_emb)
        except Exception as exc:
            logger.warning("Embedding generation failed, lexical-only retrieval will be used: %s", exc)
            return

        if not all_embeddings:
            return

        embeddings = np.vstack(all_embeddings) if len(all_embeddings) > 1 else all_embeddings[0]

        if self._embeddings_matrix is None:
            self._embeddings_matrix = embeddings
        else:
            self._embeddings_matrix = np.vstack([self._embeddings_matrix, embeddings])

        if self._index is not None:
            try:
                self._index.add(embeddings)
            except Exception as exc:
                logger.warning("FAISS add failed: %s", exc)

    def _dense_search(self, query: str, top_k: int, chunk_type: Optional[str] = None) -> List[SearchResult]:
        if not query or self._embedding_model is None or self._embeddings_matrix is None or len(self._chunks) == 0:
            return []

        allowed_indices = self._allowed_indices(chunk_type)
        if not allowed_indices:
            return []

        try:
            q_emb = self._embedding_model.encode(
                [query],
                convert_to_numpy=True,
                normalize_embeddings=True,
                show_progress_bar=False,
            ).astype("float32")
        except Exception as exc:
            logger.warning("Dense query embedding failed: %s", exc)
            return []

        if self._index is not None and chunk_type is None:
            try:
                scores, indices = self._index.search(q_emb, min(max(top_k * 4, top_k), len(self._chunks)))
                results: List[SearchResult] = []
                rank = 1
                for idx, score in zip(indices[0].tolist(), scores[0].tolist()):
                    if idx < 0 or idx >= len(self._chunks):
                        continue
                    chunk = self._chunks[idx]
                    if chunk_type and chunk.chunk_type != chunk_type:
                        continue
                    results.append(SearchResult(chunk=chunk, similarity_score=float(score), rank=rank))
                    rank += 1
                    if len(results) >= top_k:
                        break
                return results
            except Exception as exc:
                logger.warning("FAISS search failed, falling back to numpy dense search: %s", exc)

        sims = np.dot(self._embeddings_matrix[allowed_indices], q_emb[0])
        order = np.argsort(-sims)[:top_k]
        results = []
        for rank, pos in enumerate(order, start=1):
            idx = allowed_indices[int(pos)]
            results.append(SearchResult(chunk=self._chunks[idx], similarity_score=float(sims[int(pos)]), rank=rank))
        return results

    # ------------------------------------------------------------------
    # Lexical / hybrid search
    # ------------------------------------------------------------------

    def _lexical_search(self, query: str, top_k: int, chunk_type: Optional[str] = None) -> List[SearchResult]:
        if not query or not self._chunks:
            return []

        allowed = self._allowed_indices(chunk_type)
        if not allowed:
            return []

        q_tokens = _tokenize(query)
        if not q_tokens:
            return []
        q_counts = Counter(q_tokens)
        n_docs = len(self._chunks)
        k1 = 1.5
        b = 0.75

        scored: List[Tuple[int, float]] = []
        for idx in allowed:
            tf = self._chunk_term_freqs[idx]
            dl = self._chunk_lengths[idx] or 1
            score = 0.0
            for term, qf in q_counts.items():
                f = tf.get(term, 0)
                if f <= 0:
                    continue
                df = self._term_doc_freq.get(term, 0)
                idf = math.log(1 + (n_docs - df + 0.5) / (df + 0.5))
                denom = f + k1 * (1 - b + b * (dl / max(1.0, self._avg_chunk_length)))
                score += idf * ((f * (k1 + 1)) / max(1e-9, denom)) * qf

            chunk = self._chunks[idx]
            text_l = (chunk.text or "").lower()
            meta = chunk.metadata or {}

            if chunk_type and chunk.chunk_type == chunk_type:
                score += 0.15
            if any(tok in text_l for tok in q_tokens[:8]):
                score += 0.05
            if meta.get("global_number") is not None and str(meta.get("global_number")) in query:
                score += 0.25
            if chunk.chunk_type in {"equation", "table", "figure"}:
                score += float(meta.get("content_priority", 1.0)) * 0.02

            if score > 0:
                scored.append((idx, score))

        scored.sort(key=lambda x: x[1], reverse=True)
        results = []
        for rank, (idx, score) in enumerate(scored[:top_k], start=1):
            results.append(SearchResult(chunk=self._chunks[idx], similarity_score=float(score), rank=rank))
        return results

    def _rrf_fuse(self, result_lists: Sequence[Sequence[SearchResult]], top_k: int, rrf_k: int = 60) -> List[SearchResult]:
        fused_scores: Dict[str, float] = defaultdict(float)
        best_result: Dict[str, SearchResult] = {}

        for results in result_lists:
            for rank, result in enumerate(results, start=1):
                cid = result.chunk.chunk_id
                fused_scores[cid] += 1.0 / (rrf_k + rank)
                if cid not in best_result or result.similarity_score > best_result[cid].similarity_score:
                    best_result[cid] = result

        ordered = sorted(fused_scores.items(), key=lambda x: x[1], reverse=True)[:top_k]
        fused: List[SearchResult] = []
        for rank, (cid, score) in enumerate(ordered, start=1):
            base = best_result[cid]
            fused.append(SearchResult(chunk=base.chunk, similarity_score=float(score), rank=rank))
        return fused

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _allowed_indices(self, chunk_type: Optional[str]) -> List[int]:
        if chunk_type is None:
            return list(range(len(self._chunks)))
        ids = self._type_to_chunk_ids.get(chunk_type, [])
        return [self._chunk_id_to_index[cid] for cid in ids if cid in self._chunk_id_to_index]

    def _build_embedding_text(self, chunk: MultimodalChunk) -> str:
        meta = chunk.metadata or {}
        parts = [
            f"type: {chunk.chunk_type}",
            f"section: {meta.get('section', '')}",
            f"caption: {meta.get('caption', '')}",
            f"latex: {meta.get('normalized_latex') or meta.get('latex') or ''}",
            f"description: {meta.get('description', '')}",
            chunk.text or "",
        ]
        text = "\n".join(p for p in parts if p and str(p).strip())
        return re.sub(r"\s+", " ", text).strip()

    def _coerce_chunk(self, chunk: Any) -> MultimodalChunk:
        if isinstance(chunk, MultimodalChunk):
            return chunk
        return MultimodalChunk(
            chunk_id=getattr(chunk, "chunk_id"),
            text=getattr(chunk, "text", ""),
            doc_id=getattr(chunk, "doc_id", ""),
            page_num=getattr(chunk, "page_num", getattr(chunk, "page_number", 0)),
            chunk_type=getattr(chunk, "chunk_type", "text"),
            metadata=getattr(chunk, "metadata", {}) or {},
            image_path=getattr(chunk, "image_path", None),
        )

    # ------------------------------------------------------------------
    # Parent-Child Retrieval
    # ------------------------------------------------------------------

    def parent_child_search(
        self,
        query: str,
        top_k: int = 5,
        child_k: int = 15,
        chunk_type: Optional[str] = None,
    ) -> List[SearchResult]:
        """Retrieve child chunks then expand to parent (full-page) context.

        Strategy:
        1. Retrieve top child_k fine-grained chunks via hybrid search.
        2. Group by page number (parent = full page).
        3. Score parents by sum of child scores.
        4. Return top_k parents with enriched context.
        """
        children = self.hybrid_search(query=query, top_k=child_k, chunk_type=chunk_type)
        if not children:
            return []

        # Group children by page
        page_scores: Dict[int, float] = defaultdict(float)
        page_best: Dict[int, SearchResult] = {}
        for child in children:
            page = child.chunk.page_num
            page_scores[page] += child.similarity_score
            if page not in page_best or child.similarity_score > page_best[page].similarity_score:
                page_best[page] = child

        # Sort pages by aggregate score
        sorted_pages = sorted(page_scores.items(), key=lambda x: x[1], reverse=True)[:top_k]

        # Build parent results — include all chunks from winning pages
        results: List[SearchResult] = []
        for rank, (page, score) in enumerate(sorted_pages, start=1):
            best_child = page_best[page]
            # Create a synthetic parent result with aggregated score
            results.append(SearchResult(
                chunk=best_child.chunk,
                similarity_score=float(score),
                rank=rank,
            ))

        return results

    # ------------------------------------------------------------------
    # Cross-Encoder Reranker
    # ------------------------------------------------------------------

    def rerank(
        self,
        query: str,
        results: List[Any],
        top_k: int = 5,
    ) -> List[SearchResult]:
        """Rerank results using multi-signal scoring.

        Handles both SearchResult objects and raw MultimodalChunk objects
        in the input list.
        """
        if not results:
            return []

        query_tokens = set(_tokenize(query))
        if not query_tokens:
            return self._normalize_results(results)[:top_k]

        scored: List[Tuple[float, SearchResult]] = []
        for r in results:
            # Safely extract chunk and score from either SearchResult or raw MultimodalChunk
            if isinstance(r, SearchResult):
                chunk = r.chunk
                base_score = r.similarity_score
            elif hasattr(r, "chunk"):
                chunk = r.chunk
                base_score = getattr(r, "similarity_score", 0.5)
            else:
                chunk = r
                base_score = 0.5

            chunk_text = (getattr(chunk, "text", "") or "").lower()
            meta = getattr(chunk, "metadata", None) or {}

            # Multi-signal scoring
            chunk_tokens = set(_tokenize(chunk_text))
            overlap = len(query_tokens & chunk_tokens)
            union = len(query_tokens | chunk_tokens) or 1
            jaccard = overlap / union

            # Boost for metadata matches
            meta_text = " ".join([
                str(meta.get("caption", "")),
                str(meta.get("latex", "")),
                str(meta.get("description", "")),
                str(meta.get("section", "")),
            ]).lower()
            meta_tokens = set(_tokenize(meta_text))
            meta_overlap = len(query_tokens & meta_tokens) * 0.3

            # Combine: original score * 0.4 + rerank score * 0.6
            rerank_score = jaccard + meta_overlap / max(1, len(query_tokens))
            combined = base_score * 0.4 + rerank_score * 0.6

            scored.append((combined, SearchResult(chunk=chunk, similarity_score=float(combined), rank=0)))

        scored.sort(key=lambda x: x[0], reverse=True)
        reranked = []
        for rank, (score, sr) in enumerate(scored[:top_k], start=1):
            reranked.append(SearchResult(chunk=sr.chunk, similarity_score=float(score), rank=rank))
        return reranked

    @staticmethod
    def _normalize_results(items: List[Any]) -> List[SearchResult]:
        """Convert a mixed list of SearchResult/MultimodalChunk to SearchResult."""
        out = []
        for i, item in enumerate(items):
            if isinstance(item, SearchResult):
                out.append(item)
            elif hasattr(item, "chunk"):
                out.append(SearchResult(chunk=item.chunk, similarity_score=getattr(item, "similarity_score", 0.5), rank=i + 1))
            else:
                out.append(SearchResult(chunk=item, similarity_score=0.5, rank=i + 1))
        return out


__all__ = ["UnifiedVectorStore"]
