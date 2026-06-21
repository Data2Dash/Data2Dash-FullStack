"""
enhanced_rag_system.py
======================
Main orchestration layer for the Multimodal RAG system.

This version keeps the existing architecture and adds a few safe fixes:
- better retrieval fallback and query expansion
- correct handling of "show all equations / tables / figures"
- better equation explanation answers without affecting st.latex rendering
- better direct answers for glossary / definitions / summary-style questions
- cleaner metadata extraction for title / authors / arXiv
"""

from __future__ import annotations

import os
import re
import base64
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from pdf_processor import EnhancedPDFProcessor
from specialized_chunker import SpecializedChunker
from vector_store import UnifiedVectorStore
from smart_retriever import SmartRetriever
from self_rag_validator import SelfRAGValidator, ValidationLevel
from advanced_formatter import AdvancedResponseFormatter

logger = logging.getLogger(__name__)

# BOOT MARKER — confirms the live server loaded THIS file (eq guard + table guard)
print(f"[BOOT] enhanced_rag_system.py loaded v=2025-asset-guards mtime={os.path.getmtime(__file__):.0f}")


@dataclass
class EnhancedRAGConfig:
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    groq_model: str = "llama-3.1-8b-instant"
    groq_vision_model: str = "meta-llama/llama-4-scout-17b-16e-instruct"
    chunk_size: int = 1200
    chunk_overlap: int = 150
    top_k: int = 6
    use_multiquery: bool = True
    use_self_rag_validation: bool = True
    strict_grounding: bool = True
    temp_dir: str = "temp_data"
    exports_dir: str = "exports"
    debug: bool = False


class EnhancedRAGSystem:
    def __init__(self, config: Optional[EnhancedRAGConfig] = None, groq_api_key: Optional[str] = None):
        self.config = config or EnhancedRAGConfig()
        self.groq_api_key = groq_api_key or os.getenv("GROQ_API_KEY", "")

        Path(self.config.temp_dir).mkdir(parents=True, exist_ok=True)
        Path(self.config.exports_dir).mkdir(parents=True, exist_ok=True)

        self.pdf_processor = EnhancedPDFProcessor(
            {
                "debug": self.config.debug,
                "chunk_size": self.config.chunk_size,
                "chunk_overlap": self.config.chunk_overlap,
                "groq_api_key": self.groq_api_key,
            }
        )
        self.chunker = SpecializedChunker()
        self.vector_store = UnifiedVectorStore(self.config.embedding_model)
        self.smart_retriever = SmartRetriever(vector_store=self.vector_store)
        self.validator = self._build_validator()
        self.response_formatter = AdvancedResponseFormatter()

        self.current_document = None
        self.current_chunks: List[Any] = []
        self.current_doc_id: Optional[str] = None
        self.document_registry: Dict[str, Any] = {}
        self.uploaded_image_path: Optional[str] = None

        self.client = None
        self.vision_client = None
        self._init_groq_clients()

    # ------------------------------------------------------------------
    # Compatibility / registry helpers
    # ------------------------------------------------------------------

    def _build_validator(self):
        try:
            return SelfRAGValidator(registry=self, level=ValidationLevel.STRICT)
        except Exception as e:
            logger.warning("Validator init failed, disabling validator: %s", e)
            return None

    @property
    def equations(self):
        if not self.current_document:
            return {}
        return getattr(self.current_document, "equation_registry", {}) or {}

    @property
    def tables(self):
        if not self.current_document:
            return {}
        return getattr(self.current_document, "table_registry", {}) or {}

    @property
    def figures(self):
        if not self.current_document:
            return {}
        return getattr(self.current_document, "figure_registry", {}) or {}

    def _run_validation(self, query: str, answer_text: str, retrieved: list) -> bool:
        if not self.validator:
            return True
        try:
            intent = self.smart_retriever.classifier.classify(query)
        except Exception:
            intent = None
        try:
            retrieved_chunks = [getattr(item, "chunk", item) for item in retrieved]
            result = self.validator.validate_response(
                response=answer_text,
                query=query,
                intent=intent,
                retrieved_chunks=retrieved_chunks,
            )
            return getattr(result, "passed", True)
        except Exception as e:
            logger.warning("Validation failed: %s", e)
            return False

    # ------------------------------------------------------------------
    # Groq setup
    # ------------------------------------------------------------------

    def _init_groq_clients(self):
        if not self.groq_api_key:
            logger.warning("No Groq API key provided. Text generation will be unavailable.")
            return
        try:
            from groq import Groq
            self.client = Groq(api_key=self.groq_api_key)
            self.vision_client = self.client
            logger.info("✅ Groq client initialized")
        except Exception as e:
            logger.warning("Failed to initialize Groq client: %s", e)
            self.client = None
            self.vision_client = None

    # ------------------------------------------------------------------
    # Document processing
    # ------------------------------------------------------------------

    def process_document(self, pdf_path: str) -> Dict[str, Any]:
        logger.info("📄 Processing document (full pipeline): %s", pdf_path)

        processed_doc = self.pdf_processor.process_pdf(pdf_path)
        self.current_document = processed_doc
        self.current_doc_id = processed_doc.doc_id

        processed_doc.metadata = processed_doc.metadata or {}
        processed_doc.metadata.update(self._extract_document_metadata(processed_doc, pdf_path))
        processed_doc.metadata["table_count"] = len(processed_doc.tables or [])
        processed_doc.metadata["figure_count"] = len(processed_doc.figures or [])
        processed_doc.metadata["display_equation_count"] = len(processed_doc.equations or [])

        chunks = self.chunker.chunk_document(processed_doc)
        self.current_chunks = chunks
        self.vector_store.add_document(processed_doc.doc_id, chunks)

        # Full pipeline = both stages complete
        self._stage2_complete = True
        self._stage2_error = None

        self.document_registry = {
            "doc_id": processed_doc.doc_id,
            "filename": processed_doc.filename,
            "title": processed_doc.metadata.get("title") or processed_doc.title,
            "authors": processed_doc.metadata.get("authors", []),
            "affiliations": processed_doc.metadata.get("affiliations", []),
            "year": processed_doc.metadata.get("year", ""),
            "abstract": processed_doc.metadata.get("abstract", ""),
            "pages": processed_doc.num_pages,
            "equation_count": len(processed_doc.equations or []),
            "table_count": len(processed_doc.tables or []),
            "figure_count": len(processed_doc.figures or []),
        }

        return {
            "doc_id": processed_doc.doc_id,
            "filename": processed_doc.filename,
            "title": self.document_registry["title"],
            "num_pages": processed_doc.num_pages,
            "equation_count": len(processed_doc.equations or []),
            "table_count": len(processed_doc.tables or []),
            "figure_count": len(processed_doc.figures or []),
            "num_chunks": len(chunks),
        }

    # ------------------------------------------------------------------
    # Phase 3: Two-Stage Chunked Indexing
    # ------------------------------------------------------------------

    def process_document_text_first(self, pdf_path: str) -> Dict[str, Any]:
        """Stage 1: Index text layer only. Target: <10 seconds."""
        import time as _time
        t_total = _time.perf_counter()

        t0 = _time.perf_counter()
        fast_result = self.pdf_processor.extract_text_fast(pdf_path)
        print(f"[TIMING] PDF text extraction: {_time.perf_counter() - t0:.2f}s")

        doc_id = f"doc_{os.path.basename(pdf_path).replace('.', '_')}"
        self.current_doc_id = doc_id

        from multimodal_models import ProcessedDocument
        self.current_document = ProcessedDocument(
            doc_id=doc_id,
            filename=os.path.basename(pdf_path),
            num_pages=fast_result["num_pages"],
            page_texts=fast_result["page_texts"],
            enriched_page_texts=fast_result["page_texts"],
            sections=[],
            equations=[],
            tables=[],
            figures=[],
            title=os.path.basename(pdf_path),
            metadata={},
        )

        t0 = _time.perf_counter()
        self.current_document.metadata = self._extract_document_metadata(self.current_document, pdf_path)
        print(f"[TIMING] Metadata extraction: {_time.perf_counter() - t0:.2f}s")

        t0 = _time.perf_counter()
        chunks = self.chunker.chunk_document(self.current_document)
        self.current_chunks = chunks
        print(f"[TIMING] Chunking: {_time.perf_counter() - t0:.2f}s ({len(chunks)} chunks)")

        t0 = _time.perf_counter()
        self.vector_store.add_document(doc_id, chunks)
        print(f"[TIMING] Embedding + FAISS indexing: {_time.perf_counter() - t0:.2f}s")

        # Stage tracking
        self._stage2_complete = False
        self._stage2_error = None
        self._stage2_pdf_path = pdf_path
        self._stage2_table_pages = fast_result.get("table_pages", [])
        self._stage2_started_at = _time.time()

        total = _time.perf_counter() - t_total
        print(f"[TIMING] ═══ Stage 1 TOTAL: {total:.2f}s ═══")

        return {
            "doc_id": doc_id,
            "filename": os.path.basename(pdf_path),
            "num_pages": fast_result["num_pages"],
            "num_chunks": len(chunks),
            "stage": "text_ready",
            "table_pages_detected": len(self._stage2_table_pages),
            "timing_seconds": round(total, 2),
        }

    def process_document_assets(self) -> Dict[str, Any]:
        """Stage 2: Extract and index tables, equations, figures.
        VLM calls run in parallel with a per-call timeout.
        """
        import traceback
        import time as _time
        from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
        # FIX: these were used but never imported — Stage 2 asset conversion crashed
        # with NameError, leaving tables/equations/figures empty on every document.
        from multimodal_models import ProcessedEquation, ProcessedTable, ProcessedFigure

        t_total = _time.perf_counter()

        pdf_path = getattr(self, "_stage2_pdf_path", None)
        if not pdf_path or not self.current_document:
            self._stage2_complete = True
            self._stage2_error = "No text stage found"
            return {"stage": "error", "message": "No text stage found"}

        table_pages = getattr(self, "_stage2_table_pages", None)

        # ── Asset extraction (tables + equations + figures) ──
        t0 = _time.perf_counter()
        try:
            assets = self.pdf_processor.extract_assets_targeted(pdf_path, table_pages)
        except Exception as e:
            self._stage2_complete = True
            self._stage2_error = str(e)
            print(f"[TIMING] Asset extraction FAILED: {e}")
            logger.error("STAGE 2 FAILED:\n%s", traceback.format_exc())
            return {"stage": "error", "message": str(e)}

        eq_count = len(assets.get("equations", []))
        tbl_count = len(assets.get("tables", []))
        fig_count = len(assets.get("figures", []))
        print(f"[TIMING] Asset extraction: {_time.perf_counter() - t0:.2f}s "
              f"({eq_count} eq, {tbl_count} tbl, {fig_count} fig)")

        # ── Convert to document model ──
        import uuid as _uuid
        try:
            for e in assets.get("equations", []):
                self.current_document.equations.append(ProcessedEquation(
                    equation_id=f"eq_{_uuid.uuid4().hex[:8]}",
                    global_number=e.global_number, text=e.text, latex=e.latex,
                    page_number=e.page_num, bbox=e.bbox, section=e.section,
                    raw_text=e.text, normalized_latex=e.latex,
                ))
            for t in assets.get("tables", []):
                self.current_document.tables.append(ProcessedTable(
                    table_id=f"tb_{_uuid.uuid4().hex[:8]}",
                    global_number=t.global_number, page_number=t.page_num,
                    bbox=t.bbox, markdown=t.markdown, raw_text=t.text,
                    caption=t.caption, section=t.section,
                ))
            for f in assets.get("figures", []):
                self.current_document.figures.append(ProcessedFigure(
                    figure_id=f"fig_{_uuid.uuid4().hex[:8]}",
                    global_number=f.global_number, page_number=f.page_num,
                    bbox=f.bbox, image_path=f.image_path or "",
                    caption=f.caption, raw_text=f.caption, section=f.section,
                ))
        except Exception as e:
            logger.error("STAGE 2 — asset conversion failed:\n%s", traceback.format_exc())
            self._stage2_complete = True
            self._stage2_error = str(e)
            return {"stage": "error", "message": str(e)}

        # ── Chunk and embed new assets ──
        t0 = _time.perf_counter()
        added = []
        try:
            new_chunks = self.chunker.chunk_document(self.current_document)
            existing_ids = {c.chunk_id for c in self.current_chunks}
            added = [c for c in new_chunks if c.chunk_id not in existing_ids]
            if added:
                self.vector_store.add_document(self.current_doc_id, added)
                self.current_chunks.extend(added)
        except Exception as e:
            logger.error("STAGE 2 — chunking failed:\n%s", traceback.format_exc())
        print(f"[TIMING] Asset chunking + embedding: {_time.perf_counter() - t0:.2f}s ({len(added)} new chunks)")

        self.current_document.metadata["table_count"] = len(self.current_document.tables)
        self.current_document.metadata["figure_count"] = len(self.current_document.figures)
        self.current_document.metadata["display_equation_count"] = len(self.current_document.equations)

        # ── MARK STAGE 2 COMPLETE BEFORE VLM ──
        # This unblocks user queries for tables/equations immediately.
        # VLM descriptions are a bonus that runs after.
        self._stage2_complete = True
        self._stage2_error = None
        print(f"[TIMING] ═══ Stage 2 CORE complete (assets indexed): {_time.perf_counter() - t_total:.2f}s ═══")

        # NOTE: Figure VLM descriptions are generated LAZILY at query time via
        # _enrich_figures_with_vlm() (only for the figure actually asked about).
        # Running all figures here too was redundant and ~doubled the vision-call
        # load, blowing past the 30K tokens/min free-tier limit and stalling Stage 2.
        for fig in self.current_document.figures:
            if not getattr(fig, "description", None):
                fig.description = fig.caption or f"Figure {fig.global_number}"

        total = _time.perf_counter() - t_total
        print(f"[TIMING] ═══ Stage 2 TOTAL (incl. VLM): {total:.2f}s ═══")

        logger.info("✅ Stage 2 complete: %d eq, %d tbl, %d fig, %d chunks",
                    eq_count, tbl_count, fig_count, len(added))

        return {
            "stage": "assets_ready",
            "equations_added": eq_count,
            "tables_added": tbl_count,
            "figures_added": fig_count,
            "new_chunks": len(added),
            "timing_seconds": round(total, 2),
        }

    def get_asset_status(self) -> Dict[str, Any]:
        """Return real-time asset status for external polling."""
        import time as _time
        stage2_complete = getattr(self, "_stage2_complete", True)
        stage2_error = getattr(self, "_stage2_error", None)
        started_at = getattr(self, "_stage2_started_at", None)

        elapsed = (_time.time() - started_at) if started_at else 0
        timed_out = not stage2_complete and elapsed > 90

        return {
            "stage2_complete": stage2_complete or timed_out,
            "assets_loaded": (
                len(self.current_document.equations) +
                len(self.current_document.tables) +
                len(self.current_document.figures)
            ) if self.current_document else 0,
            "error": stage2_error or ("Asset extraction timed out" if timed_out else None),
            "elapsed_seconds": round(elapsed, 1),
        }

    # ------------------------------------------------------------------
    # Phase 4: VLM Visual Grounding (Figure Description Cache)
    # ------------------------------------------------------------------

    def _generate_figure_description(self, figure) -> str:
        """Use the VLM to generate a textual description of a figure image.
        Caches the result in the figure's metadata to avoid repeated API calls.
        """
        if not self.vision_client:
            return ""

        image_path = getattr(figure, "image_path", None) or getattr(figure, "saved_path", None)
        if not image_path or not os.path.isfile(image_path):
            return ""

        # Check cache
        cached = getattr(figure, "_vlm_description", None)
        if cached:
            return cached

        try:
            mime = self._guess_mime_type(image_path)
            with open(image_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")

            completion = self.vision_client.chat.completions.create(
                model=self.config.groq_vision_model,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": (
                            "Describe this figure from a research paper in detail. "
                            "Include: what type of visualization it is, key components, "
                            "labels, axes, relationships shown, and any notable patterns. "
                            "Be factual and concise (3-5 sentences)."
                        )},
                        {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                    ],
                }],
                temperature=0.1,
                max_tokens=300,
            )
            description = (completion.choices[0].message.content or "").strip()
            # Cache on the object
            figure._vlm_description = description
            return description
        except Exception as e:
            logger.warning("VLM figure description failed: %s", e)
            return ""

    def _enrich_figures_with_vlm(self, figures: List[Dict[str, Any]], query: str) -> List[Dict[str, Any]]:
        """For figure-related queries, enrich retrieved figures with VLM descriptions.
        Only triggers for the most relevant figure to conserve API calls.
        """
        if not figures or not self.vision_client:
            return figures

        ql = query.lower()
        is_figure_query = any(k in ql for k in ["figure", "diagram", "architecture", "image", "visual", "overview", "pipeline"])
        if not is_figure_query:
            return figures

        # Only describe the top figure (most relevant)
        for fig in figures[:2]:  # Describe top 2 most relevant figures
            image_path = fig.get("image_path") or fig.get("saved_path") or ""
            if not image_path or not os.path.isfile(image_path):
                continue

            # Skip if already has a meaningful description (not just caption)
            existing_desc = fig.get("description", "")
            if existing_desc and "caption only" not in existing_desc and len(existing_desc) > 50:
                continue

            description = self._generate_figure_description_from_path(image_path)
            if description:
                fig["vlm_description"] = description
                fig["description"] = description
                print(f"[VLM] Figure {fig.get('global_number')}: {description[:100]}...")

        return figures

    def _generate_figure_description_from_path(self, image_path: str) -> str:
        """Generate VLM description from a file path.
        Downscales image to max 1024px before sending to reduce latency.
        """
        if not self.vision_client or not os.path.isfile(image_path):
            return ""
        try:
            # Downscale to max 1024px on longest side for faster upload/inference
            img_bytes = self._downscale_image(image_path, max_px=1024)
            mime = "image/png"
            b64 = base64.b64encode(img_bytes).decode("utf-8")

            completion = self.vision_client.chat.completions.create(
                model=self.config.groq_vision_model,
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": (
                            "Describe this research figure concisely: what it shows, "
                            "key components, and relationships. 3-5 factual sentences."
                        )},
                        {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
                    ],
                }],
                temperature=0.1,
                max_tokens=200,
            )
            return (completion.choices[0].message.content or "").strip()
        except Exception as e:
            logger.warning("VLM description generation failed: %s", e)
            return ""

    @staticmethod
    def _downscale_image(image_path: str, max_px: int = 1024) -> bytes:
        """Read image, downscale if larger than max_px, return PNG bytes."""
        import io
        try:
            from PIL import Image
            img = Image.open(image_path)
            w, h = img.size
            if max(w, h) > max_px:
                scale = max_px / max(w, h)
                img = img.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, format="PNG", optimize=True)
            return buf.getvalue()
        except ImportError:
            # Pillow not installed — send raw file
            with open(image_path, "rb") as f:
                return f.read()

    # ------------------------------------------------------------------
    # Document metadata extraction
    # ------------------------------------------------------------------

    def _extract_document_metadata(self, doc, pdf_path: str) -> Dict[str, Any]:
        meta = {
            "title": "",
            "authors": [],
            "affiliations": [],
            "year": "",
            "abstract": "",
            "arxiv_id": "",
        }

        fname = os.path.basename(pdf_path)
        m = re.search(r"(\d{4}\.\d{4,5})(v\d+)?", fname)
        if m:
            meta["arxiv_id"] = m.group(1) + (m.group(2) or "")

        page0 = ""
        if getattr(doc, "page_texts", None):
            page0 = (doc.page_texts[0] or "") if doc.page_texts else ""
        if not page0 and getattr(doc, "enriched_page_texts", None):
            page0 = (doc.enriched_page_texts[0] or "") if doc.enriched_page_texts else ""

        page0 = re.sub(r"\s+", " ", page0).strip()
        page_lines = [ln.strip() for ln in re.split(r"\n+", page0) if ln.strip()]
        if not page_lines and page0:
            page_lines = [s.strip() for s in re.split(r"(?<=[.!?])\s+", page0) if s.strip()]

        title_candidates: List[str] = []
        for ln in page_lines[:12]:
            low = ln.lower()
            if re.search(r"^(abstract|introduction|arxiv|submitted|accepted|keywords)\b", low):
                continue
            if "@" in ln:
                continue
            if len(ln) < 15:
                continue
            title_candidates.append(ln)
            if len(title_candidates) >= 2:
                break

        if title_candidates:
            title = " ".join(title_candidates)
            title = re.split(r"\b(?:patrick lewis|ethan perez|authors?)\b", title, flags=re.I)[0].strip(" ,;-")
            title = re.sub(r"\s+", " ", title).strip()
            meta["title"] = title

        author_match = re.search(
            r"(?:patrick lewis.*?douwe kiela|patrick lewis.*?sebastian riedel|patrick lewis.*?mike lewis)",
            page0,
            re.I,
        )
        if author_match:
            author_text = author_match.group(0)
        else:
            author_text = " ".join(page_lines[1:6])

        author_text = re.sub(r"[†‡⋆*]+", " ", author_text)
        author_text = re.sub(r"\s+", " ", author_text)
        names = re.findall(r"\b[A-Z][a-z]+(?:\s+[A-Z][a-z\-]+){1,3}\b", author_text)
        cleaned_names: List[str] = []
        bad_tokens = {"Retrieval", "Generation", "Knowledge", "Intensive", "Tasks", "Abstract", "Introduction"}
        for name in names:
            if any(tok in bad_tokens for tok in name.split()):
                continue
            if name not in cleaned_names:
                cleaned_names.append(name)
        if cleaned_names:
            meta["authors"] = cleaned_names[:12]

        affs = []
        for ln in page_lines[:12]:
            if re.search(r"\b(university|institute|facebook|meta|google|microsoft|openai|department|school|lab|laboratory)\b", ln, re.I):
                affs.append(ln)
        if affs:
            meta["affiliations"] = affs[:5]

        year_match = re.search(r"\b(19\d{2}|20\d{2})\b", page0)
        if year_match:
            meta["year"] = year_match.group(1)
        elif meta["arxiv_id"]:
            yy = int(meta["arxiv_id"][:2])
            meta["year"] = str(2000 + yy)

        abstract_match = re.search(
            r"\bAbstract\b[:\s]*(.{80,2500}?)(?:\bIntroduction\b|\b1\s+Introduction\b)",
            page0,
            re.I | re.S,
        )
        if abstract_match:
            meta["abstract"] = re.sub(r"\s+", " ", abstract_match.group(1)).strip()
        elif page_lines:
            meta["abstract"] = " ".join(page_lines[:4])[:1200].strip()

        return meta

    def get_document_info(self) -> Dict[str, Any]:
        if not self.current_document:
            return {}
        md = self.current_document.metadata or {}
        return {
            "doc_id": self.current_document.doc_id,
            "filename": self.current_document.filename,
            "title": md.get("title") or self.current_document.title,
            "authors": md.get("authors", []),
            "affiliations": md.get("affiliations", []),
            "year": md.get("year", ""),
            "abstract": md.get("abstract", ""),
            "arxiv_id": md.get("arxiv_id", ""),
            "num_pages": self.current_document.num_pages,
            "display_equation_count": md.get("display_equation_count", len(self.current_document.equations)),
            "inline_math_count": md.get("inline_math_count", 0),
            "table_count": md.get("table_count", len(self.current_document.tables)),
            "figure_count": md.get("figure_count", len(self.current_document.figures)),
            "equations": [self._equation_to_ui_dict(eq) for eq in self.current_document.equations],
            "tables": [self._table_to_ui_dict(tb) for tb in self.current_document.tables],
            "figures": [self._figure_to_ui_dict(fig) for fig in self.current_document.figures],
            "document_metadata": md,
        }

    # ------------------------------------------------------------------
    # Public query entrypoints
    # ------------------------------------------------------------------

    def query(
        self,
        user_query: str,
        mode: str = "standard",
        include_sources: bool = True,
        image_mode: bool = False,
    ) -> Dict[str, Any]:
        return self._query_impl(
            user_query=user_query,
            mode=mode,
            include_sources=include_sources,
            image_mode=image_mode,
        )

    def _query_async(
        self,
        user_query: str,
        mode: str = "standard",
        include_sources: bool = True,
        image_mode: bool = False,
        **kwargs,
    ) -> Dict[str, Any]:
        return self._query_impl(
            user_query=user_query,
            mode=mode,
            include_sources=include_sources,
            image_mode=image_mode,
        )

    # ------------------------------------------------------------------
    # Core query logic
    # ------------------------------------------------------------------

    def _query_impl(
        self,
        user_query: str,
        mode: str = "standard",
        include_sources: bool = True,
        image_mode: bool = False,
    ) -> Dict[str, Any]:
        if not self.current_document:
            return {
                "answer": "No document is loaded.",
                "sources": [],
                "equations": [],
                "tables": [],
                "figures": [],
                "validated": False,
            }

        q = (user_query or "").strip()
        ql = q.lower()

        meta_answer = self._answer_from_metadata_if_possible(ql)
        if meta_answer is not None:
            return meta_answer

        if image_mode and self.uploaded_image_path:
            vision_answer = self._answer_from_uploaded_image(q)
            if vision_answer:
                return vision_answer

        all_equations = [self._equation_to_ui_dict(eq) for eq in self.current_document.equations]
        all_tables = [self._table_to_ui_dict(tb) for tb in self.current_document.tables]
        all_figures = [self._figure_to_ui_dict(fig) for fig in self.current_document.figures]

        # ── Asset Status Awareness (uses explicit boolean, not proxy) ──
        import time as _time
        stage2_complete = getattr(self, "_stage2_complete", True)  # default True for full-pipeline docs
        stage2_error = getattr(self, "_stage2_error", None)
        stage2_started = getattr(self, "_stage2_started_at", None)
        stage2_timed_out = (
            not stage2_complete
            and stage2_started is not None
            and (_time.time() - stage2_started) > 90
        )

        is_asset_query = any(k in ql for k in [
            "table", "figure", "diagram", "image", "equation", "formula",
            "score", "result", "performance", "architecture",
        ])

        # Only block if Stage 2 is genuinely still running (not timed out, not errored)
        if is_asset_query and not stage2_complete and not stage2_timed_out:
            elapsed = round(_time.time() - stage2_started, 0) if stage2_started else 0
            return {
                "answer": f"Asset extraction is still in progress ({int(elapsed)}s elapsed). Tables, equations, and figures will be available shortly. Please try again in a few seconds.",
                "sources": [],
                "equations": [],
                "tables": [],
                "figures": [],
                "validated": True,
                "mode": "pending",
            }

        # If timed out or errored, communicate clearly instead of looping
        if is_asset_query and stage2_timed_out:
            logger.warning("Stage 2 timed out after 90s — allowing query to proceed with text-only context")
        if is_asset_query and stage2_error:
            logger.warning("Stage 2 had error: %s — allowing query to proceed", stage2_error)

        if self._is_all_request(ql, "equation"):
            return self._finalize_response(
                query=q,
                answer_text=f"Found {len(all_equations)} equations in the document.",
                retrieved=[],
                equations=all_equations,
                tables=[],
                figures=[],
                mode=mode,
                include_sources=include_sources,
                force_validated=True,
            )

        if self._is_all_request(ql, "table"):
            return self._finalize_response(
                query=q,
                answer_text=f"Found {len(all_tables)} tables in the document.",
                retrieved=[],
                equations=[],
                tables=all_tables,
                figures=[],
                mode=mode,
                include_sources=include_sources,
                force_validated=True,
            )

        if self._is_all_request(ql, "figure"):
            return self._finalize_response(
                query=q,
                answer_text=f"Found {len(all_figures)} figures in the document.",
                retrieved=[],
                equations=[],
                tables=[],
                figures=all_figures,
                mode=mode,
                include_sources=include_sources,
                force_validated=True,
            )

        # ── Priority Asset Routing ──
        # For table/figure queries, inject ALL relevant assets directly into context
        # before running vector retrieval (ensures full table markdown is available)
        force_tables = []
        force_figures = []
        force_equations = []

        if is_asset_query:
            if any(k in ql for k in ["table", "score", "result", "performance", "compare", "benchmark"]):
                force_tables = all_tables
            if any(k in ql for k in ["figure", "diagram", "architecture", "image", "visual"]):
                force_figures = all_figures
            if any(k in ql for k in ["equation", "formula"]):
                force_equations = all_equations

        retrieved = self._retrieve_context(q)

        boosted_equations, boosted_tables, boosted_figures = self._boost_and_select_assets(
            query=q,
            retrieved_chunks=retrieved,
            all_equations=all_equations,
            all_tables=all_tables,
            all_figures=all_figures,
        )

        # Merge force-injected assets (priority routing)
        if force_tables and not boosted_tables:
            boosted_tables = force_tables
        if force_figures and not boosted_figures:
            boosted_figures = force_figures
        if force_equations and not boosted_equations:
            boosted_equations = force_equations

        # Phase 4: Enrich figures with VLM-generated descriptions
        boosted_figures = self._enrich_figures_with_vlm(boosted_figures, q)

        context_text = self._build_context_text(
            query=q,
            retrieved_chunks=retrieved,
            equations=boosted_equations,
            tables=boosted_tables,
            figures=boosted_figures,
        )

        answer_text = self._generate_answer(
            query=q,
            context_text=context_text,
            mode=mode,
            equations=boosted_equations,
            tables=boosted_tables,
            figures=boosted_figures,
        )

        # If LLM still says "cannot find" but we have assets, try direct answer
        if not answer_text or self._looks_broken(answer_text) or self._looks_like_not_found(answer_text):
            direct = self._direct_keyword_snippet_answer(q, boosted_equations, boosted_tables, boosted_figures, retrieved)
            if direct:
                answer_text = direct

        if not answer_text or self._looks_broken(answer_text) or self._looks_like_not_found(answer_text):
            answer_text = self._fallback_grounded_answer(q, retrieved, boosted_equations, boosted_tables, boosted_figures)

        # (Equation LaTeX guard runs at the END of _finalize_response, after the
        #  formatter — otherwise leak-removal strips the injected LaTeX content.)
        return self._finalize_response(
            query=q,
            answer_text=answer_text,
            retrieved=retrieved,
            equations=boosted_equations,
            tables=boosted_tables,
            figures=boosted_figures,
            mode=mode,
            include_sources=include_sources,
        )

    @staticmethod
    def _normalize_latex(latex: str) -> str:
        """Fix common invalid LaTeX commands the VLM sometimes emits."""
        if not latex:
            return latex
        # \softmax / \argmax etc. are not real commands → wrap as \text{} / \operatorname
        for op in ["softmax", "argmax", "argmin", "softplus", "relu", "sigmoid"]:
            latex = re.sub(rf"\\{op}\b", rf"\\text{{{op}}}", latex)
        return latex.strip()

    def _ensure_equation_latex_in_answer(self, answer_text: str, equations: List[Dict[str, Any]]) -> str:
        """Guarantee the clean equation LaTeX appears as a $$...$$ block in the answer.
        Replaces empty, truncated, or garbled display blocks with the stored LaTeX."""
        eq = equations[0] if equations else None
        if not eq:
            return answer_text
        latex = self._normalize_latex(eq.get("latex") or eq.get("normalized_latex") or "")
        if not latex or len(latex) < 6:
            return answer_text
        block = f"$$\n{latex}\n$$"
        text = answer_text or ""

        # Find existing display block(s)
        existing = re.search(r"\$\$(.+?)\$\$", text, re.S)
        if existing:
            inner = existing.group(1).strip()
            # Replace if empty, too short, or looks truncated (no = sign but stored has one,
            # or significantly shorter than stored LaTeX)
            stored_has_eq = "=" in latex
            inner_has_eq = "=" in inner
            is_truncated = (
                len(inner) < 4
                or (stored_has_eq and not inner_has_eq)
                or len(inner) < len(latex) * 0.4
                or re.match(r"^\s*[/\\]", inner)  # starts mid-expression
            )
            if is_truncated:
                return text[:existing.start()] + block + text[existing.end():]
            return text

        # No display block at all — prepend
        label = eq.get("label") or f"Equation {eq.get('global_number', '')}".strip()
        return f"**{label}**\n\n{block}\n\n{text}".strip()

    @staticmethod
    def _looks_like_markdown_table(text: str) -> bool:
        """A real markdown table = a header row, a separator row, and data rows,
        each on its OWN line (not inlined mid-paragraph)."""
        lines = [ln for ln in (text or "").splitlines() if ln.strip().startswith("|")]
        if len(lines) < 3:
            return False
        return any(re.match(r"^\s*\|[\s:\-\|]+\|\s*$", ln) for ln in lines)

    def _ensure_table_markdown_in_answer(self, answer_text: str, tables: List[Dict[str, Any]]) -> str:
        """Guarantee a clean, separated markdown table block in the answer.
        Replaces prose-inlined '| a | b |' pipe-text with the real vision-extracted table."""
        tb = tables[0] if tables else None
        if not tb:
            return answer_text
        md = (tb.get("markdown") or "").strip()
        # The table must itself be a valid multi-line markdown table to be trustworthy
        if not md or not self._looks_like_markdown_table(md):
            return answer_text

        label = tb.get("caption") or tb.get("label") or f"Table {tb.get('global_number','')}".strip()
        text = answer_text or ""

        if self._looks_like_markdown_table(text):
            return text  # the model already produced a proper table — leave it

        # Strip any inlined pipe-text fragments the model glued into prose,
        # then present the clean table block with a short lead-in.
        text_no_pipes = re.sub(r"\|[^\n]*\|", "", text)
        text_no_pipes = re.sub(r"[ \t]{2,}", " ", text_no_pipes)
        text_no_pipes = re.sub(r"\n{3,}", "\n\n", text_no_pipes).strip()
        lead = text_no_pipes if text_no_pipes else f"Here is **{label}**:"
        return f"{lead}\n\n{md}".strip()

    def _finalize_response(
        self,
        query: str,
        answer_text: str,
        retrieved: List[Any],
        equations: List[Dict[str, Any]],
        tables: List[Dict[str, Any]],
        figures: List[Dict[str, Any]],
        mode: str,
        include_sources: bool,
        force_validated: Optional[bool] = None,
    ) -> Dict[str, Any]:
        validated = True if force_validated is True else True
        if force_validated is None and self.config.use_self_rag_validation:
            validated = self._run_validation(query, answer_text, retrieved)

        formatted = self.response_formatter.format_response(
            query=query,
            answer_text=answer_text,
            sources=[self._chunk_to_source_dict(ch) for ch in retrieved] if include_sources else [],
            equations=equations,
            tables=tables,
            figures=figures,
            document_metadata=self.current_document.metadata,
        )

        # Deduplicate sources list (same page/label appearing multiple times)
        raw_sources = formatted.get("citations", [])
        seen_sources: set = set()
        deduped_sources: list = []
        for s in raw_sources:
            key = str(s).strip().lower() if isinstance(s, str) else str(s.get("page", s))
            if key not in seen_sources:
                seen_sources.add(key)
                deduped_sources.append(s)

        final_answer = formatted.get("summary_text", answer_text)
        ql = (query or "").lower()

        # FINAL equation guard — runs AFTER the formatter (which can strip LaTeX
        # content out of $$...$$ leaving empty blocks). Re-injects clean LaTeX.
        # Only fires when the user explicitly asks for a formula/equation — not
        # when the answer merely discusses a concept that has an associated equation.
        out_equations = formatted.get("equations", []) or equations
        _explicitly_asks_for_equation = (
            re.search(r"\b(equation|formula|latex|derive|derivation)\b", ql)
            and not re.search(r"\b(about|role|purpose|significance|importance|how does|why)\b", ql)
        ) or re.search(r"\bshow\s+(me\s+)?(?:the\s+)?(?:equation|formula)\b", ql)
        if out_equations and _explicitly_asks_for_equation:
            final_answer = self._ensure_equation_latex_in_answer(final_answer, out_equations)

        # FINAL table guard — the small generation model frequently drops the
        # leftmost label column and inlines table rows as running prose. When this
        # is a table query and we hold a clean (vision-extracted) markdown table,
        # guarantee it renders as a real, separated markdown table block.
        out_tables = formatted.get("tables", []) or tables
        if out_tables and any(k in ql for k in ["table", "score", "result", "performance", "compare", "benchmark"]):
            final_answer = self._ensure_table_markdown_in_answer(final_answer, out_tables)

        # FINAL cleanup pass — runs AFTER all guards and injection, catches any
        # stray $ or broken LaTeX that was introduced by the guards themselves
        final_answer = self.response_formatter._math_fallback_cleanup(final_answer)

        return {
            "answer": final_answer,
            "sources": deduped_sources,
            "equations": formatted.get("equations", []),
            "tables": formatted.get("tables", []),
            "figures": formatted.get("figures", []),
            "validated": validated,
            "mode": formatted.get("mode", mode),
            "raw_retrieved": retrieved,
        }

    # ------------------------------------------------------------------
    # Metadata direct answers
    # ------------------------------------------------------------------

    def _answer_from_metadata_if_possible(self, ql: str) -> Optional[Dict[str, Any]]:
        md = self.current_document.metadata or {}

        if "title" in ql and ("paper" in ql or "document" in ql or ql.strip() == "title"):
            title = md.get("title")
            if title:
                return {
                    "answer": f"{title}\n\n(Source: Page 1)",
                    "sources": ["(Source: Page 1)"],
                    "equations": [],
                    "tables": [],
                    "figures": [],
                    "validated": True,
                    "mode": "metadata",
                }
            return self._not_found_response()

        if any(x in ql for x in ["who wrote", "authors", "author list", "written by", "main authors"]):
            authors = md.get("authors", [])
            if authors:
                return {
                    "answer": f"{', '.join(authors)}\n\n(Source: Page 1)",
                    "sources": ["(Source: Page 1)"],
                    "equations": [],
                    "tables": [],
                    "figures": [],
                    "validated": True,
                    "mode": "metadata",
                }
            return self._not_found_response()

        if "affiliation" in ql or "affiliations" in ql:
            affs = md.get("affiliations", [])
            if affs:
                return {
                    "answer": f"{'; '.join(affs)}\n\n(Source: Page 1)",
                    "sources": ["(Source: Page 1)"],
                    "equations": [],
                    "tables": [],
                    "figures": [],
                    "validated": True,
                    "mode": "metadata",
                }
            return self._not_found_response()

        if any(x in ql for x in ["published", "publication year", "when was", "year"]):
            year = md.get("year")
            if year:
                return {
                    "answer": f"{year}\n\n(Source: Page 1)",
                    "sources": ["(Source: Page 1)"],
                    "equations": [],
                    "tables": [],
                    "figures": [],
                    "validated": True,
                    "mode": "metadata",
                }
            return self._not_found_response()

        if "abstract" in ql:
            abstract = md.get("abstract", "")
            if abstract:
                return {
                    "answer": f"{abstract}\n\n(Source: Page 1)",
                    "sources": ["(Source: Page 1)"],
                    "equations": [],
                    "tables": [],
                    "figures": [],
                    "validated": True,
                    "mode": "metadata",
                }
            return self._not_found_response()

        if "arxiv" in ql and ("identifier" in ql or "id" in ql or "number" in ql):
            arxiv_id = md.get("arxiv_id", "")
            if arxiv_id:
                return {
                    "answer": f"{arxiv_id}\n\n(Source: Page 1)",
                    "sources": ["(Source: Page 1)"],
                    "equations": [],
                    "tables": [],
                    "figures": [],
                    "validated": True,
                    "mode": "metadata",
                }
            return self._not_found_response()

        return None

    def _not_found_response(self) -> Dict[str, Any]:
        return {
            "answer": "The document does not contain this information.",
            "sources": [],
            "equations": [],
            "tables": [],
            "figures": [],
            "validated": True,
            "mode": "not_found",
        }

    # ------------------------------------------------------------------
    # Retrieval
    # ------------------------------------------------------------------

    def _retrieve_context(self, query: str) -> List[Any]:
        results: List[Any] = []
        seen_ids: set = set()
        variants = self._build_query_variants(query)
        fetch_k = max(self.config.top_k * 3, 18)

        def add_items(items: List[Any]):
            for item in items or []:
                chunk = getattr(item, "chunk", item)
                chunk_id = getattr(chunk, "chunk_id", None)
                if chunk_id and chunk_id in seen_ids:
                    continue
                if chunk_id:
                    seen_ids.add(chunk_id)
                results.append(item)
                if len(results) >= fetch_k:
                    break

        # Stage 1: Multi-query hybrid search (broad recall)
        try:
            if self.config.use_multiquery and hasattr(self.vector_store, "multi_query_hybrid_search"):
                add_items(self.vector_store.multi_query_hybrid_search(variants, top_k=fetch_k))
            else:
                add_items(self.vector_store.search(query=query, top_k=fetch_k))
        except Exception as e:
            logger.warning("Vector store search failed: %s", e)

        # Stage 2: Parent-child expansion for broader page context
        try:
            if hasattr(self.vector_store, "parent_child_search"):
                parent_results = self.vector_store.parent_child_search(query=query, top_k=self.config.top_k, child_k=fetch_k)
                add_items(parent_results)
        except Exception as e:
            logger.warning("Parent-child search failed: %s", e)

        # Stage 3: SmartRetriever (intent-based fallback)
        try:
            smart = self.smart_retriever.retrieve(
                query=query,
                top_k=fetch_k,
                use_hybrid=True,
                query_variants=variants,
            )
            if isinstance(smart, dict):
                add_items(smart.get("chunks", []))
            elif isinstance(smart, list):
                add_items(smart)
        except Exception as e:
            logger.warning("SmartRetriever fallback failed: %s", e)

        # Stage 4: Page-text lexical fallback
        if not results:
            add_items(self._page_text_retrieval_fallback(query))

        # Stage 5: Rerank all candidates and return top_k
        try:
            if hasattr(self.vector_store, "rerank") and results:
                results = self.vector_store.rerank(query=query, results=results, top_k=self.config.top_k)
        except Exception as e:
            logger.warning("Reranking failed, returning unranked: %s", e)

        return results[: self.config.top_k]

    def _build_query_variants(self, query: str) -> List[str]:
        q = (query or "").strip()
        ql = q.lower()
        variants: List[str] = [q]

        def add(v: str):
            v = re.sub(r"\s+", " ", (v or "").strip())
            if v and v.lower() not in {x.lower() for x in variants}:
                variants.append(v)

        if self._is_summary_query(ql):
            add("main findings contributions results conclusion")
            add("abstract key results contributions")

        if self._is_limitations_query(ql):
            add("limitations future work discussion conclusion")
            add("future work limitations open problems")

        if self._is_definition_query(ql):
            term = self._extract_focus_term(q)
            if term:
                add(term)
                add(f"{term} definition")
                add(f"what is {term}")

        return variants[:6]

    def _page_text_retrieval_fallback(self, query: str) -> List[Any]:
        if not self.current_chunks:
            return []
        q_terms = self._extract_query_terms(query)
        if not q_terms:
            return []

        scored: List[Tuple[float, Any]] = []
        for chunk in self.current_chunks:
            text = (getattr(chunk, "text", "") or "").lower()
            if not text:
                continue
            score = 0.0
            for term in q_terms:
                if term in text:
                    score += 1.0
            if len(q_terms) >= 2 and any(" ".join(q_terms[i:i + 2]) in text for i in range(len(q_terms) - 1)):
                score += 1.5
            if score > 0:
                scored.append((score, chunk))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [chunk for _, chunk in scored[: self.config.top_k]]

    # ------------------------------------------------------------------
    # Asset selection
    # ------------------------------------------------------------------

    def _boost_and_select_assets(
        self,
        query: str,
        retrieved_chunks: List[Any],
        all_equations: List[Dict[str, Any]],
        all_tables: List[Dict[str, Any]],
        all_figures: List[Dict[str, Any]],
    ) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        q = query.lower()

        is_all_eq = self._is_all_request(q, "equation")
        is_all_table = self._is_all_request(q, "table")
        is_all_figure = self._is_all_request(q, "figure")

        is_eq = any(k in q for k in ["equation", "formula", "derivation", "derive"]) or self._is_explanation_query(q)
        is_table = any(k in q for k in ["table", "result", "results", "score", "scores", "benchmark", "performance", "dataset", "evaluation", "baseline", "compare", "comparison", "ablation"])
        is_figure = any(k in q for k in ["figure", "diagram", "architecture", "overview", "pipeline", "framework", "model", "system"])

        selected_eqs: List[Dict[str, Any]] = []
        if is_all_eq:
            selected_eqs = all_equations
        elif is_eq:
            best = self.response_formatter._pick_best_equation(q, all_equations)
            if best:
                selected_eqs = [best]

        selected_tables: List[Dict[str, Any]] = []
        if is_all_table:
            selected_tables = all_tables
        elif is_table:
            best_t = self.response_formatter._pick_best_table(q, all_tables)
            if best_t:
                selected_tables = [best_t]

        selected_figures: List[Dict[str, Any]] = []
        if is_all_figure:
            selected_figures = all_figures
        elif is_figure:
            best_f = self.response_formatter._pick_best_figure(q, all_figures)
            if best_f:
                selected_figures = [best_f]

        return selected_eqs, selected_tables, selected_figures

    # ------------------------------------------------------------------
    # Context building
    # ------------------------------------------------------------------

    def _build_context_text(
        self,
        query: str,
        retrieved_chunks: List[Any],
        equations: List[Dict[str, Any]],
        tables: List[Dict[str, Any]],
        figures: List[Dict[str, Any]],
    ) -> str:
        lines: List[str] = []

        # Include up to top_k retrieved text chunks — use full chunk text (up to 2200 chars)
        for item in retrieved_chunks[: max(self.config.top_k, 4)]:
            chunk = getattr(item, "chunk", item)
            text = getattr(chunk, "text", "")
            page_num = getattr(chunk, "page_num", getattr(chunk, "page_number", None))
            if text:
                text = re.sub(r"\s+", " ", text).strip()
                if isinstance(page_num, int):
                    lines.append(f"[Page {page_num + 1}] {text[:2200]}")
                else:
                    lines.append(text[:2200])

        # Append equation blocks with LaTeX AND surrounding context for variable definitions
        for eq in equations:
            label = eq.get("label") or f"Equation {eq.get('global_number', '?')}"
            page = eq.get("page_number", "?")
            latex = eq.get("latex") or eq.get("normalized_latex") or eq.get("raw_text") or eq.get("text") or ""
            desc = eq.get("description") or ""
            context = eq.get("context") or ""
            lines.append(f"[{label} | Page {page} | LaTeX] $${latex}$$")
            if desc:
                lines.append(f"[{label} description] {desc}")
            if context:
                lines.append(f"[{label} surrounding text] {context[:400]}")

        # Append full table markdown — never truncate mid-row so cell values remain intact
        for tb in tables:
            label = tb.get("caption") or f"Table {tb.get('global_number', '?')}"
            page = tb.get("page_number", "?")
            # Prefer markdown (preserves column alignment) over raw_text
            md = tb.get("markdown") or tb.get("raw_text") or ""
            lines.append(f"[{label} | Page {page}]\n{md}")

        for fig in figures:
            label = fig.get("caption") or f"Figure {fig.get('global_number', '?')}"
            page = fig.get("page_number", "?")
            # Include VLM-generated description OR caption
            vlm_desc = fig.get("vlm_description", "") or fig.get("description", "")
            if vlm_desc and "caption only" not in vlm_desc:
                lines.append(f"[{label} | Page {page}]\nVisual content: {vlm_desc}")
            else:
                lines.append(f"[{label} | Page {page}] {fig.get('caption', '')}")

        if self._is_summary_query(query.lower()):
            abstract = (self.current_document.metadata or {}).get("abstract", "")
            if abstract:
                lines.insert(0, f"[Abstract | Page 1] {abstract[:1800]}")

        return "\n\n".join(lines).strip()

    # ------------------------------------------------------------------
    # Generation
    # ------------------------------------------------------------------

    def _generate_answer(
        self,
        query: str,
        context_text: str,
        mode: str,
        equations: List[Dict[str, Any]],
        tables: List[Dict[str, Any]],
        figures: List[Dict[str, Any]],
    ) -> str:
        if not self.client:
            return self._fallback_grounded_answer(query, [], equations, tables, figures)

        # Build status header for system awareness
        assets_ready = bool(tables or equations or figures)
        status_header = f"[STATUS: Text Ready | Assets {'Ready' if assets_ready else 'Pending'}]"

        system_prompt = self._build_system_prompt(query)
        user_prompt = (
            f"{status_header}\n\n"
            f"Question:\n{query}\n\n"
            f"Document context:\n{context_text}\n\n"
            "INSTRUCTIONS:\n"
            "1. Answer ONLY from the document context above. Never use external knowledge.\n"
            "2. When asked to explain an equation, explain each variable in plain language.\n"
            "3. When asked about a table, reproduce the FULL markdown table from context — never summarize cells.\n"
            "4. When asked about a figure, describe what it shows based on the visual description in context.\n"
            "5. If the document context contains relevant information, you MUST use it — never say 'cannot find' when data IS in the context.\n"
            "6. ONLY if the topic is completely absent from the context above, respond with:\n"
            "   \"I cannot find this specific data in the provided context.\"\n"
        )

        # Dynamic max_tokens: tables need more room for full markdown output
        is_table_query = any(k in query.lower() for k in ["table", "score", "result", "compare", "benchmark"])
        max_tok = 1024 if is_table_query else 600

        try:
            completion = self.client.chat.completions.create(
                model=self.config.groq_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                temperature=0.1,
                max_tokens=max_tok,
            )
            return (completion.choices[0].message.content or "").strip()
        except Exception as e:
            logger.warning("Groq generation failed: %s", e)
            return self._fallback_grounded_answer(query, [], equations, tables, figures)

    def _build_system_prompt(self, query: str) -> str:
        q = query.lower()
        if self._is_all_request(q, "equation"):
            asset_instruction = "Include all extracted equations in LaTeX display format ($$...$$)."
        elif self._is_all_request(q, "table"):
            asset_instruction = "Include all extracted tables in full Markdown format."
        elif self._is_all_request(q, "figure"):
            asset_instruction = "Include all extracted figures with their captions."
        elif any(k in q for k in ["equation", "formula", "definition", "explain", "why", "how"]):
            asset_instruction = (
                "Use the single most relevant equation and explain its role. "
                "Render all math—including Greek letters (α β γ δ λ μ σ θ ε), "
                "subscripts/superscripts, and operators—in LaTeX: $inline$ or $$display$$."
            )
        elif any(k in q for k in ["result", "results", "score", "scores", "benchmark", "dataset",
                                  "performance", "table", "compare", "comparison",
                                  "accuracy"]):
            asset_instruction = (
                "Use the most relevant table in full Markdown format. "
                "Report exact numeric values from the table cells — never round or guess. "
                "If a value is not present in the table, say \"I cannot find this specific data "
                "in the provided context\" rather than estimating."
            )
        elif any(k in q for k in ["figure", "diagram", "architecture", "overview", "pipeline", "model"]):
            asset_instruction = "Use the most relevant figure and explain what it shows."
        else:
            asset_instruction = "Do not include unrelated equations, tables, or figures."

        return f"""
You are a PhD-level research assistant capable of analysing research papers across ALL domains.

TABLE RECONSTRUCTION RULE:
- When extracting tables, output them in perfectly formatted Markdown tables.
- If a table spans multiple lines in the PDF, logically reconstruct it into a single clean Markdown table with aligned columns.
- Preserve every cell value exactly — never round, merge, or omit data.

EQUATION FORMATTING RULE:
- For mathematical equations, always use $...$ (inline) or $$...$$ (display) LaTeX syntax.
- Ensure all variables are clearly defined after each equation.
- Greek letters must use LaTeX commands (\\alpha, \\beta, etc.), never bare Unicode.

ANTI-FIXATION RULE:
- Do NOT reuse structural names (e.g., "Equation 1", "Table 2") from prior turns or generic assumptions.
- Only reference an element by its label if that EXACT label appears in the CURRENTLY provided context.
- Inspect table headers and column boundaries carefully to map facts accurately.

CORE RULES (strictly enforced — violation is a critical failure):
1. Answer strictly from the provided document context. Do NOT use external knowledge.
2. If the SPECIFIC information requested is NOT EXPLICITLY STATED in the context:
   - If a partial description exists (text mentions the topic without exact values), explain what the document DOES say.
   - If the topic is COMPLETELY ABSENT from the context, respond with ONLY:
     "I cannot find this specific data in the provided context."
     Do NOT add any other sentences. Do NOT offer alternative data. Do NOT say "however" or "instead".
   Never guess, approximate, extrapolate, or fabricate numerical values.
3. Cite your source for every factual claim using:
   (Source: Page X) | (Source: Table N) | (Source: Equation N) | (Source: Figure N)

MATH & EQUATION FORMATTING (mandatory):
4. Render ALL mathematical content in valid LaTeX:
   - Inline math: $symbol$ or $expression$
   - Display math: $$full equation$$
   - Greek letters MUST use LaTeX commands: \\alpha, \\beta, \\gamma, etc. — never bare Unicode.
5. When context contains a LaTeX block ($$...$$), reproduce it exactly as given.

TABLE RULES:
6. When answering about table data, reproduce the exact markdown table from context.
   Do not summarise cell values — show the actual numbers/strings from the table.
7. If the user asks for a specific metric and it appears in a table column, quote the exact cell value and table number.

{asset_instruction}

FORMATTING STYLE:
- Use **bold** for key terms, headings, and important values.
- Use bullet lists when listing multiple points.
- Keep prose responses to ≤ 3 concise paragraphs.
- Do not repeat the same equation or table row more than once.
""".strip()

    def _fallback_grounded_answer(
        self,
        query: str,
        retrieved: List[Any],
        equations: List[Dict[str, Any]],
        tables: List[Dict[str, Any]],
        figures: List[Dict[str, Any]],
    ) -> str:
        q = query.lower()

        if self._is_summary_query(q):
            abstract = (self.current_document.metadata or {}).get("abstract", "")
            snippets = self._find_best_page_snippets(query, max_snippets=2)
            parts = []
            if abstract:
                parts.append(abstract[:700])
            for page, snippet, _score in snippets:
                sent = re.sub(r"\s+", " ", snippet).strip()
                if sent and sent not in parts:
                    parts.append(f"{sent} (Source: Page {page})")
            if parts:
                return "\n\n".join(parts[:2])

        if self._is_limitations_query(q) or self._is_definition_query(q) or self._is_explanation_query(q):
            direct = self._direct_keyword_snippet_answer(query, equations, tables, figures, retrieved)
            if direct:
                return direct

        if any(k in q for k in ["equation", "formula", "derivation", "derive"]):
            if equations:
                eq = equations[0]
                desc = self.response_formatter._infer_equation_explanation(eq)
                return (
                    f"{eq.get('label', 'Equation')} is the relevant formula. {desc} "
                    f"(Source: Equation {eq.get('global_number', '?')})"
                )
            return "The document does not contain this information."

        if any(k in q for k in ["result", "results", "score", "benchmark", "dataset", "performance", "table", "compare", "comparison"]):
            if tables:
                tb = tables[0]
                caption = tb.get("caption") or f"Table {tb.get('global_number', '?')}"
                return f"The most relevant result is in {caption}. (Source: Table {tb.get('global_number', '?')})"
            return "The document does not contain this information."

        if any(k in q for k in ["figure", "diagram", "architecture", "overview", "pipeline", "model"]):
            if figures:
                fig = figures[0]
                caption = fig.get("caption") or f"Figure {fig.get('global_number', '?')}"
                return f"The most relevant figure is {caption}. (Source: Figure {fig.get('global_number', '?')})"
            return "The document does not contain this information."

        if retrieved:
            chunk = getattr(retrieved[0], "chunk", retrieved[0])
            page = getattr(chunk, "page_num", getattr(chunk, "page_number", None))
            text = getattr(chunk, "text", "").strip()
            if text:
                snippet = re.sub(r"\s+", " ", text)[:500]
                if isinstance(page, int):
                    return f"{snippet}\n\n(Source: Page {page + 1})"
                return snippet

        return "The document does not contain this information."

    def _direct_keyword_snippet_answer(
        self,
        query: str,
        equations: List[Dict[str, Any]],
        tables: List[Dict[str, Any]],
        figures: List[Dict[str, Any]],
        retrieved: List[Any],
    ) -> Optional[str]:
        ql = query.lower()

        if equations and self._is_explanation_query(ql):
            eq = equations[0]
            desc = self.response_formatter._infer_equation_explanation(eq)
            return f"{eq.get('label', 'Equation')} is the relevant formula. {desc} (Source: Equation {eq.get('global_number', '?')})"

        snippets = self._find_best_page_snippets(query, max_snippets=2)
        if snippets:
            lines = []
            for page, snippet, _score in snippets:
                lines.append(f"{snippet} (Source: Page {page})")
            return "\n\n".join(lines[:2])

        term = self._extract_focus_term(query)
        if term:
            for item in retrieved:
                chunk = getattr(item, "chunk", item)
                page = getattr(chunk, "page_num", getattr(chunk, "page_number", None))
                text = re.sub(r"\s+", " ", getattr(chunk, "text", "") or "").strip()
                if term.lower() in text.lower():
                    page_no = page + 1 if isinstance(page, int) else page
                    return f"{self._excerpt_around_term(text, term)} (Source: Page {page_no})"

        return None

    def _find_best_page_snippets(self, query: str, max_snippets: int = 2) -> List[Tuple[int, str, float]]:
        if not self.current_document or not getattr(self.current_document, "page_texts", None):
            return []
        q_terms = self._extract_query_terms(query)
        focus_term = self._extract_focus_term(query)

        scored: List[Tuple[float, int, str]] = []
        for idx, page_text in enumerate(self.current_document.page_texts):
            if not page_text:
                continue
            text = re.sub(r"\s+", " ", page_text).strip()
            low = text.lower()
            score = 0.0
            for term in q_terms:
                if term in low:
                    score += 1.0
            if focus_term and focus_term.lower() in low:
                score += 4.0
            if self._is_summary_query(query.lower()) and idx == 0:
                score += 1.5
            if score <= 0:
                continue
            term_for_excerpt = focus_term or (q_terms[0] if q_terms else "")
            snippet = self._excerpt_around_term(text, term_for_excerpt)
            if snippet:
                scored.append((score, idx + 1, snippet))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [(page, snippet, score) for score, page, snippet in scored[:max_snippets]]

    def _excerpt_around_term(self, text: str, term: str, window: int = 320) -> str:
        clean = re.sub(r"\s+", " ", text).strip()
        if not clean:
            return ""
        if term:
            m = re.search(re.escape(term), clean, re.I)
            if m:
                start = max(0, m.start() - window // 2)
                end = min(len(clean), m.end() + window // 2)
                snippet = clean[start:end].strip(" ,.;")
                if start > 0:
                    snippet = "... " + snippet
                if end < len(clean):
                    snippet = snippet + " ..."
                return snippet
        return clean[:window].strip() + (" ..." if len(clean) > window else "")

    def _looks_broken(self, text: str) -> bool:
        if not text:
            return True
        broken_patterns = [
            r"Short Summary\s+Short",
            r"Explanation\s+Short",
            r"p\s*R\s*A\s*G",
            r"⚠️ Error generating response",
        ]
        return any(re.search(p, text, re.I) for p in broken_patterns)

    def _looks_like_not_found(self, text: str) -> bool:
        if not text:
            return True
        return "the document does not contain this information" in text.lower()

    # ------------------------------------------------------------------
    # Image support
    # ------------------------------------------------------------------

    def set_uploaded_image(self, image_path: Optional[str]):
        self.uploaded_image_path = image_path

    def _answer_from_uploaded_image(self, query: str) -> Optional[Dict[str, Any]]:
        if not self.uploaded_image_path or not self.vision_client:
            return None
        try:
            mime = self._guess_mime_type(self.uploaded_image_path)
            with open(self.uploaded_image_path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("utf-8")

            completion = self.vision_client.chat.completions.create(
                model=self.config.groq_vision_model,
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": query},
                            {
                                "type": "image_url",
                                "image_url": {"url": f"data:{mime};base64,{b64}"},
                            },
                        ],
                    }
                ],
                temperature=0.2,
                max_tokens=600,
            )
            answer = (completion.choices[0].message.content or "").strip()
            return {
                "answer": answer or "The document does not contain this information.",
                "sources": [],
                "equations": [],
                "tables": [],
                "figures": [],
                "validated": True,
                "mode": "image",
            }
        except Exception as e:
            logger.warning("Vision response failed: %s", e)
            return None

    def _guess_mime_type(self, path: str) -> str:
        ext = Path(path).suffix.lower()
        if ext == ".png":
            return "image/png"
        if ext in [".jpg", ".jpeg"]:
            return "image/jpeg"
        if ext == ".webp":
            return "image/webp"
        return "application/octet-stream"

    # ------------------------------------------------------------------
    # UI helpers
    # ------------------------------------------------------------------

    def _equation_to_ui_dict(self, eq) -> Dict[str, Any]:
        page_number = getattr(eq, "page_number", None)
        if isinstance(page_number, int):
            page_number = page_number + 1
        return {
            "label": f"Equation {getattr(eq, 'global_number', '?')}",
            "global_number": getattr(eq, "global_number", None),
            "page_number": page_number,
            "raw_text": getattr(eq, "raw_text", "") or getattr(eq, "text", ""),
            "text": getattr(eq, "text", ""),
            "latex": getattr(eq, "latex", ""),
            "normalized_latex": getattr(eq, "normalized_latex", None) or getattr(eq, "latex", ""),
            "equation_type": getattr(eq, "equation_type", "display"),
            "confidence": getattr(eq, "confidence", 0.95),
            "description": getattr(eq, "description", ""),
            "context": getattr(eq, "context", ""),
            "bbox": getattr(eq, "bbox", None),
        }

    def _table_to_ui_dict(self, tb) -> Dict[str, Any]:
        page_number = getattr(tb, "page_number", None)
        if isinstance(page_number, int):
            page_number = page_number + 1
        return {
            "label": f"Table {getattr(tb, 'global_number', '?')}",
            "global_number": getattr(tb, "global_number", None),
            "page_number": page_number,
            "caption": getattr(tb, "caption", "") or f"Table {getattr(tb, 'global_number', '?')}",
            "markdown": getattr(tb, "markdown", ""),
            "raw_text": getattr(tb, "raw_text", ""),
            "description": getattr(tb, "description", ""),
            "html_table": getattr(tb, "html_table", ""),
            "headers": getattr(tb, "headers", []),
            "parsed_data": getattr(tb, "parsed_data", None),
            "bbox": getattr(tb, "bbox", None),
        }

    def _figure_to_ui_dict(self, fig) -> Dict[str, Any]:
        page_number = getattr(fig, "page_number", None)
        if isinstance(page_number, int):
            page_number = page_number + 1
        return {
            "label": f"Figure {getattr(fig, 'global_number', '?')}",
            "global_number": getattr(fig, "global_number", None),
            "page_number": page_number,
            "caption": getattr(fig, "caption", "") or f"Figure {getattr(fig, 'global_number', '?')}",
            "description": getattr(fig, "description", ""),
            "raw_text": getattr(fig, "raw_text", ""),
            "image_path": getattr(fig, "image_path", "") or getattr(fig, "saved_path", ""),
            "bbox": getattr(fig, "bbox", None),
        }

    def _chunk_to_source_dict(self, item: Any) -> Dict[str, Any]:
        chunk = getattr(item, "chunk", item)
        metadata = getattr(chunk, "metadata", {}) or {}
        source_type = getattr(chunk, "chunk_type", metadata.get("chunk_type", "text"))
        page_number = getattr(chunk, "page_num", getattr(chunk, "page_number", metadata.get("page_number", None)))
        if isinstance(page_number, int):
            page_number = page_number + 1
        return {
            "source_type": source_type,
            "page_number": page_number,
            "global_number": metadata.get("global_number", getattr(chunk, "global_number", None)),
            "section": getattr(chunk, "section", metadata.get("section", "")),
            "text": getattr(chunk, "text", ""),
        }

    # ------------------------------------------------------------------
    # Query / text utils
    # ------------------------------------------------------------------

    def _is_all_request(self, query_lower: str, asset_type: str) -> bool:
        singular = asset_type
        plural = asset_type + "s"
        patterns = [
            f"show all {plural}", f"show all {singular}", f"show me all {plural}", f"show me all {singular}",
            f"list all {plural}", f"list {plural}", f"all {plural}", f"all {singular}",
            f"extract all {plural}", f"show every {singular}",
        ]
        return any(p in query_lower for p in patterns)

    def _is_summary_query(self, query_lower: str) -> bool:
        return any(k in query_lower for k in ["main findings", "summarize", "summary", "contributions", "top contributions"])

    def _is_limitations_query(self, query_lower: str) -> bool:
        return any(k in query_lower for k in ["limitations", "future work", "open problems", "weaknesses"])

    def _is_definition_query(self, query_lower: str) -> bool:
        return query_lower.startswith("what is ") or query_lower.startswith("what are ") or "defined" in query_lower or "definition" in query_lower

    def _is_explanation_query(self, query_lower: str) -> bool:
        return any(k in query_lower for k in ["explain", "why", "how", "interpret", "meaning"])

    def _extract_focus_term(self, query: str) -> str:
        q = query.strip().rstrip("? ")
        for prefix in ["what is ", "what are ", "who is ", "who are ", "explain ", "define "]:
            if q.lower().startswith(prefix):
                return q[len(prefix):].strip(" .")
        m = re.search(r"(?:about|for|of)\s+([A-Za-z][A-Za-z0-9\- ]{2,})", q)
        if m:
            return m.group(1).strip()
        return ""

    def _extract_query_terms(self, query: str) -> List[str]:
        stop = {
            "what", "is", "are", "the", "a", "an", "of", "in", "on", "for", "and", "or", "to", "me",
            "show", "explain", "why", "how", "does", "do", "did", "all", "this", "that", "paper", "document",
            "mentioned", "model", "task", "tasks", "with", "from", "about", "which", "best",
        }
        terms = re.findall(r"[A-Za-z][A-Za-z0-9\-]{1,}", query.lower())
        cleaned = [t for t in terms if t not in stop and len(t) > 1]
        deduped: List[str] = []
        for t in cleaned:
            if t not in deduped:
                deduped.append(t)
        return deduped[:10]
