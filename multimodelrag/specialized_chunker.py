"""
specialized_chunker.py - نظام Chunking & Embedding متخصص V2.0
================================================================
✅ استراتيجية منفصلة لكل نوع محتوى (معادلات/جداول/نصوص/صور)
✅ Metadata غنية لتحسين الاسترجاع
✅ Context window ذكي لكل نوع
✅ Priority scoring تلقائي
"""

import re
import logging
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass, field
import hashlib

logger = logging.getLogger(__name__)

try:
    from multimodal_models import MultimodalChunk, ProcessedDocument, ProcessedEquation, ProcessedTable, ProcessedFigure
    HAS_MODELS = True
except ImportError:
    HAS_MODELS = False
    logger.warning("⚠️ models.py not found")


@dataclass
class ChunkingStrategy:
    """استراتيجية chunking لنوع محتوى معين"""
    chunk_type: str
    chunk_size: int
    overlap: int
    context_window: int  # كم سطر قبل/بعد للسياق
    priority_boost: float  # boost للأهمية
    metadata_extractors: List[str] = field(default_factory=list)


class SpecializedChunker:
    """
    نظام chunking متخصص لكل نوع محتوى
    """
    
    # استراتيجيات منفصلة لكل نوع
    STRATEGIES = {
        'equation': ChunkingStrategy(
            chunk_type='equation',
            chunk_size=800,
            overlap=100,
            context_window=6,  # 6 lines before/after for variable definitions
            priority_boost=1.5,
            metadata_extractors=['equation_number', 'section', 'variables']
        ),
        'table': ChunkingStrategy(
            chunk_type='table',
            chunk_size=2000,  # الجداول أكبر
            overlap=0,  # لا overlap للجداول
            context_window=2,
            priority_boost=1.3,
            metadata_extractors=['table_number', 'caption', 'columns']
        ),
        'figure': ChunkingStrategy(
            chunk_type='figure',
            chunk_size=1000,
            overlap=0,
            context_window=2,
            priority_boost=1.2,
            metadata_extractors=['figure_number', 'caption']
        ),
        'text': ChunkingStrategy(
            chunk_type='text',
            chunk_size=1500,
            overlap=300,
            context_window=0,
            priority_boost=1.0,
            metadata_extractors=['section', 'keywords']
        )
    }
    
    def __init__(self):
        logger.info("✅ SpecializedChunker initialized")
    
    def chunk_equation(
        self,
        equation: ProcessedEquation,
        doc_id: str,
        page_text: str,
        section: str = ""
    ) -> MultimodalChunk:
        """
        Chunking متخصص للمعادلات
        """
        strategy = self.STRATEGIES['equation']
        
        # استخراج السياق المحيط
        context = self._extract_context_around_equation(
            equation, page_text, strategy.context_window
        )
        
        # Clean LaTeX at ingestion: fix $$$ → $$, remove empty $$ blocks
        raw_latex = equation.latex or equation.text or ""
        raw_latex = re.sub(r"\${3,}", "$$", raw_latex)
        raw_latex = re.sub(r"\$\$\s*\$\$", "", raw_latex)

        chunk_text = f"""
[EQUATION {equation.global_number}]

LaTeX: {raw_latex}

Context: {context}

Description: {equation.description or 'Mathematical equation'}

Section: {section or equation.section}
""".strip()
        
        # استخراج المتغيرات
        variables = self._extract_variables(equation.text)
        
        # بناء metadata غنية
        metadata = {
            'global_number': equation.global_number,
            'equation_id': equation.equation_id,
            'type': 'equation',
            'equation_number': str(equation.global_number),
            'section': section or equation.section,
            'page_num': equation.page_number,
            'latex': equation.latex or equation.text,
            'normalized_latex': getattr(equation, 'normalized_latex', None) or equation.latex or equation.text,
            'raw_text': equation.raw_text or equation.text,
            'equation_type': getattr(equation, 'equation_type', 'display'),
            'confidence': getattr(equation, 'confidence', 0.9),
            'variables': variables,
            'context': context[:400],
            'content_priority': strategy.priority_boost,
            'has_description': bool(equation.description),
            'bbox': equation.bbox,
            'chunk_type': 'equation'
        }
        
        chunk_id = self._generate_chunk_id(doc_id, 'equation', equation.global_number)
        
        return MultimodalChunk(
            chunk_id=chunk_id,
            text=chunk_text,
            doc_id=doc_id,
            page_num=equation.page_number,
            chunk_type='equation',
            metadata=metadata,
            image_path=None
        )
    
    def chunk_table(
        self,
        table: ProcessedTable,
        doc_id: str,
        page_text: str,
        section: str = ""
    ) -> MultimodalChunk:
        """Table chunking — stores FULL markdown as a single unbroken chunk."""
        strategy = self.STRATEGIES['table']

        context = self._extract_context_around_table(
            table, page_text, strategy.context_window
        )

        table_structure = self._analyze_table_structure(table.markdown)

        # Validation: warn if table structure looks inconsistent
        if table_structure['rows'] > 0 and table_structure['cols'] < 2:
            logger.warning(
                "Table %d (page %d): Only %d column detected — possible extraction issue",
                table.global_number, table.page_number, table_structure['cols']
            )
        
        # بناء نص الـ chunk
        chunk_text = f"""
[TABLE {table.global_number}]

Caption: {table.caption}

Data:
{table.markdown}

Context: {context}

Section: {section or table.section}

Structure: {table_structure['rows']} rows × {table_structure['cols']} columns
""".strip()
        
        metadata = {
            'global_number': table.global_number,
            'table_id': table.table_id,
            'type': 'table',
            'table_number': str(table.global_number),
            'caption': table.caption,
            'section': section or table.section,
            'page_num': table.page_number,
            'markdown': table.markdown,
            'num_rows': table_structure['rows'],
            'num_cols': table_structure['cols'],
            'headers': table_structure['headers'],
            'context': context[:200],
            'content_priority': strategy.priority_boost,
            'has_image': bool(table.table_image_path),
            'bbox': table.bbox,
            'chunk_type': 'table'
        }
        
        chunk_id = self._generate_chunk_id(doc_id, 'table', table.global_number)
        
        return MultimodalChunk(
            chunk_id=chunk_id,
            text=chunk_text,
            doc_id=doc_id,
            page_num=table.page_number,
            chunk_type='table',
            metadata=metadata,
            image_path=table.table_image_path
        )
    
    def chunk_figure(
        self,
        figure: ProcessedFigure,
        doc_id: str,
        page_text: str,
        section: str = ""
    ) -> MultimodalChunk:
        """
        Chunking متخصص للصور/الرسومات
        """
        strategy = self.STRATEGIES['figure']
        
        # استخراج السياق
        context = self._extract_context_around_figure(
            figure, page_text, strategy.context_window
        )
        
        chunk_text = f"""
[FIGURE {figure.global_number}]
Figure {figure.global_number} Fig. {figure.global_number} Fig {figure.global_number}

Caption: {figure.caption}

Description: {figure.description or 'Visual content'}

Context: {context}

Section: {section or figure.section}
""".strip()

        metadata = {
            'global_number': figure.global_number,
            'figure_id': figure.figure_id,
            'type': 'figure',
            'figure_number': str(figure.global_number),
            'caption': figure.caption,
            'section': section or figure.section,
            'page_num': figure.page_number,
            'has_image': bool(figure.saved_path),
            'image_path': figure.saved_path,
            'visual_score': figure.visual_content_score,
            'context': context[:400],
            'content_priority': strategy.priority_boost,
            'bbox': figure.bbox,
            'chunk_type': 'figure'
        }
        
        chunk_id = self._generate_chunk_id(doc_id, 'figure', figure.global_number)
        
        return MultimodalChunk(
            chunk_id=chunk_id,
            text=chunk_text,
            doc_id=doc_id,
            page_num=figure.page_number,
            chunk_type='figure',
            metadata=metadata,
            image_path=figure.saved_path
        )
    
    def chunk_text(
        self,
        text: str,
        doc_id: str,
        page_num: int,
        section: str = "",
        chunk_idx: int = 0
    ) -> MultimodalChunk:
        """
        Chunking متخصص للنصوص العادية
        """
        strategy = self.STRATEGIES['text']
        
        # استخراج keywords
        keywords = self._extract_keywords(text)
        
        # تحديد نوع المحتوى
        content_type = self._classify_text_content(text)
        
        metadata = {
            'section': section,
            'page_num': page_num,
            'chunk_idx': chunk_idx,
            'keywords': keywords[:10],  # أول 10 keywords
            'content_type': content_type,
            'word_count': len(text.split()),
            'char_count': len(text),
            'content_priority': strategy.priority_boost,
            'chunk_type': 'text'
        }
        
        chunk_id = self._generate_chunk_id(doc_id, 'text', f"{page_num}_{chunk_idx}")
        
        return MultimodalChunk(
            chunk_id=chunk_id,
            text=text.strip(),
            doc_id=doc_id,
            page_num=page_num,
            chunk_type='text',
            metadata=metadata,
            image_path=None
        )
    

    def chunk_document(self, processed_doc: ProcessedDocument) -> List[MultimodalChunk]:
        """
        Backward-compatible API expected by enhanced_rag_system.py.
        This safely preserves the existing pipeline by delegating to build_all_chunks().
        """
        return self.build_all_chunks(processed_doc)

    def build_all_chunks(self, processed_doc: ProcessedDocument) -> List[MultimodalChunk]:
        """
        بناء جميع الـ chunks من الوثيقة المعالجة
        """
        chunks = []
        doc_id = processed_doc.doc_id
        
        # 1. معادلات (أولوية عالية)
        logger.info(f"📐 Processing {len(processed_doc.equations)} equations...")
        for eq in processed_doc.equations:
            page_text = processed_doc.page_texts[eq.page_number] if eq.page_number < len(processed_doc.page_texts) else ""
            chunk = self.chunk_equation(eq, doc_id, page_text, eq.section)
            chunks.append(chunk)
        
        # 2. جداول
        logger.info(f"📊 Processing {len(processed_doc.tables)} tables...")
        for table in processed_doc.tables:
            page_text = processed_doc.page_texts[table.page_number] if table.page_number < len(processed_doc.page_texts) else ""
            chunk = self.chunk_table(table, doc_id, page_text, table.section)
            chunks.append(chunk)
        
        # 3. صور/رسومات
        logger.info(f"🖼️ Processing {len(processed_doc.figures)} figures...")
        for fig in processed_doc.figures:
            page_text = processed_doc.page_texts[fig.page_number] if fig.page_number < len(processed_doc.page_texts) else ""
            chunk = self.chunk_figure(fig, doc_id, page_text, fig.section)
            chunks.append(chunk)
        
        # 4. نصوص (بعد إزالة المعادلات/الجداول/الصور)
        logger.info(f"📝 Processing {len(processed_doc.enriched_page_texts)} pages of text...")
        strategy = self.STRATEGIES['text']
        
        for page_num, page_text in enumerate(processed_doc.enriched_page_texts):
            # تقسيم النص إلى chunks
            text_chunks = self._split_text_with_overlap(
                page_text,
                strategy.chunk_size,
                strategy.overlap
            )
            
            # تحديد القسم الحالي
            section = self._find_section_for_page(processed_doc.sections, page_num)
            
            for idx, text_chunk in enumerate(text_chunks):
                if len(text_chunk.strip()) < 100:  # تجاهل chunks صغيرة جداً
                    continue
                chunk = self.chunk_text(text_chunk, doc_id, page_num, section, idx)
                chunks.append(chunk)
        
        logger.info(f"✅ Created {len(chunks)} total chunks")
        logger.info(f"   - Equations: {sum(1 for c in chunks if c.chunk_type == 'equation')}")
        logger.info(f"   - Tables: {sum(1 for c in chunks if c.chunk_type == 'table')}")
        logger.info(f"   - Figures: {sum(1 for c in chunks if c.chunk_type == 'figure')}")
        logger.info(f"   - Text: {sum(1 for c in chunks if c.chunk_type == 'text')}")
        
        return chunks
    
    # ─── Helper Methods ───────────────────────────────────────────────────────
    
    def _generate_chunk_id(self, doc_id: str, chunk_type: str, identifier: Any) -> str:
        """توليد معرّف فريد للـ chunk"""
        content = f"{doc_id}_{chunk_type}_{identifier}"
        return hashlib.md5(content.encode()).hexdigest()[:16]
    
    def _extract_context_around_equation(
        self, equation: ProcessedEquation, page_text: str, window: int
    ) -> str:
        """استخراج السياق المحيط بالمعادلة"""
        lines = page_text.split('\n')
        
        # محاولة إيجاد المعادلة في النص
        eq_text = equation.text[:50]  # أول 50 حرف
        
        for i, line in enumerate(lines):
            if eq_text in line or equation.latex in line if equation.latex else False:
                start = max(0, i - window)
                end = min(len(lines), i + window + 1)
                context_lines = lines[start:end]
                return ' '.join(context_lines)
        
        # fallback: أخذ سياق عشوائي
        return page_text[:500]
    
    def _extract_context_around_table(
        self, table: ProcessedTable, page_text: str, window: int
    ) -> str:
        """استخراج السياق المحيط بالجدول"""
        lines = page_text.split('\n')
        
        # البحث عن caption
        for i, line in enumerate(lines):
            if table.caption[:30] in line:
                start = max(0, i - window)
                end = min(len(lines), i + window + 1)
                return ' '.join(lines[start:end])
        
        return page_text[:500]
    
    def _extract_context_around_figure(
        self, figure: ProcessedFigure, page_text: str, window: int
    ) -> str:
        """Extract caption + paragraphs before and after the figure reference."""
        lines = page_text.split('\n')
        context_parts = []

        caption_prefix = (figure.caption or "")[:30]
        fig_num = figure.global_number
        fig_ref_patterns = [
            f"Figure {fig_num}",
            f"Fig. {fig_num}",
            f"Fig {fig_num}",
            f"figure {fig_num}",
        ]

        caption_idx = None
        for i, line in enumerate(lines):
            if caption_prefix and caption_prefix in line:
                caption_idx = i
                break

        if caption_idx is not None:
            expanded_window = max(window, 5)
            start = max(0, caption_idx - expanded_window)
            end = min(len(lines), caption_idx + expanded_window + 1)
            context_parts.append(' '.join(lines[start:end]))

        for i, line in enumerate(lines):
            if i == caption_idx:
                continue
            if any(ref in line for ref in fig_ref_patterns):
                start = max(0, i - 2)
                end = min(len(lines), i + 3)
                para = ' '.join(lines[start:end])
                if para not in context_parts:
                    context_parts.append(para)

        if context_parts:
            return ' '.join(context_parts)[:800]
        return page_text[:500]
    
    def _extract_variables(self, text: str) -> List[str]:
        """استخراج المتغيرات من المعادلة"""
        # البحث عن متغيرات شائعة
        variables = set()
        
        # متغيرات يونانية
        greek = re.findall(r'[αβγδεζηθικλμνξπρστυφχψω]', text)
        variables.update(greek)
        
        # متغيرات لاتينية (حرف واحد)
        latin = re.findall(r'\b[a-zA-Z]\b', text)
        variables.update(latin)
        
        return list(variables)[:20]  # حد أقصى 20 متغير
    
    def _analyze_table_structure(self, markdown: str) -> Dict[str, Any]:
        """Analyze table structure from markdown representation."""
        lines = markdown.strip().split('\n')

        # Count data rows (lines with | that aren't separator lines)
        data_lines = [l for l in lines if '|' in l and not re.match(r'^\s*\|[\s\-:]+\|\s*$', l)]
        rows = len(data_lines)

        # Count columns from the first data row
        cols = 0
        headers = []
        if data_lines:
            first_row = data_lines[0]
            cells = [c.strip() for c in first_row.split('|') if c.strip()]
            cols = len(cells)
            headers = cells

        return {
            'rows': rows,
            'cols': cols,
            'headers': headers
        }
    
    def _extract_keywords(self, text: str) -> List[str]:
        """استخراج keywords من النص"""
        # إزالة stop words بسيطة
        stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for'}
        
        words = re.findall(r'\b\w{4,}\b', text.lower())
        keywords = [w for w in words if w not in stop_words]
        
        # عد التكرارات
        word_counts = {}
        for word in keywords:
            word_counts[word] = word_counts.get(word, 0) + 1
        
        # ترتيب حسب التكرار
        sorted_keywords = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)
        
        return [word for word, count in sorted_keywords[:20]]
    
    def _classify_text_content(self, text: str) -> str:
        """تصنيف نوع المحتوى النصي"""
        text_lower = text.lower()
        
        if any(kw in text_lower for kw in ['method', 'approach', 'algorithm', 'procedure']):
            return 'methodology'
        elif any(kw in text_lower for kw in ['result', 'experiment', 'evaluation', 'performance']):
            return 'results'
        elif any(kw in text_lower for kw in ['introduction', 'background', 'motivation']):
            return 'introduction'
        elif any(kw in text_lower for kw in ['conclusion', 'summary', 'future work']):
            return 'conclusion'
        else:
            return 'general'
    
    def _split_text_with_overlap(
        self, text: str, chunk_size: int, overlap: int
    ) -> List[str]:
        """Layout-aware text splitting that preserves structural boundaries.

        Splits on markdown boundaries (headers, display math, table blocks)
        before falling back to word-count chunking. This keeps equations and
        tables fully intact within a single chunk.
        """
        if not text or not text.strip():
            return []

        # Split into logical segments at structural boundaries
        segments = self._layout_aware_segment(text)

        # Merge small segments up to chunk_size, respecting boundaries
        chunks: List[str] = []
        current: List[str] = []
        current_len = 0

        for seg in segments:
            seg_len = len(seg.split())
            # If a single segment exceeds chunk_size, keep it whole (don't break math/tables)
            if seg_len > chunk_size and not current:
                chunks.append(seg.strip())
                continue
            # If adding this segment would overflow, flush current
            if current_len + seg_len > chunk_size and current:
                chunks.append('\n\n'.join(current).strip())
                # Keep overlap: last segment(s) fitting in overlap window
                overlap_buf: List[str] = []
                overlap_len = 0
                for prev in reversed(current):
                    prev_len = len(prev.split())
                    if overlap_len + prev_len > overlap:
                        break
                    overlap_buf.insert(0, prev)
                    overlap_len += prev_len
                current = overlap_buf
                current_len = overlap_len

            current.append(seg)
            current_len += seg_len

        if current:
            chunks.append('\n\n'.join(current).strip())

        return [c for c in chunks if len(c.split()) >= 15]

    @staticmethod
    def _layout_aware_segment(text: str) -> List[str]:
        """Split text into segments at layout boundaries without breaking structures.

        Boundaries: markdown headers, display math ($$...$$), table blocks (|...|),
        and double newlines (paragraph breaks).
        """
        # Pattern matches: display math blocks, markdown table rows, or headers
        boundary_re = re.compile(
            r'(?:'
            r'(?:^|\n)(?=#{1,4}\s)'          # Markdown header
            r'|(?:^|\n)(?=\$\$)'              # Display math start
            r'|(?<=\$\$)\n'                   # Display math end
            r'|(?:^|\n)(?=\|.*\|.*\n)'        # Table row start
            r'|\n{2,}'                         # Paragraph break
            r')'
        )

        segments = boundary_re.split(text)
        # Clean and filter empty segments
        return [s.strip() for s in segments if s and s.strip()]
    
    def _find_section_for_page(self, sections: List, page_num: int) -> str:
        """إيجاد اسم القسم للصفحة"""
        for section in sections:
            if section.page_number == page_num:
                return section.title
        return ""


# ═══════════════════════════════════════════════════════════════════════════
#  EMBEDDING STRATEGIES
# ═══════════════════════════════════════════════════════════════════════════

class SpecializedEmbedder:
    """
    نظام Embedding متخصص لكل نوع محتوى
    """
    
    def __init__(self, base_model: str = "sentence-transformers/all-MiniLM-L6-v2"):
        self.base_model = base_model
        logger.info(f"✅ SpecializedEmbedder initialized with {base_model}")
    
    def prepare_text_for_embedding(self, chunk: MultimodalChunk) -> str:
        """
        تحضير النص للـ embedding حسب النوع
        """
        if chunk.chunk_type == 'equation':
            return self._prepare_equation_text(chunk)
        elif chunk.chunk_type == 'table':
            return self._prepare_table_text(chunk)
        elif chunk.chunk_type == 'figure':
            return self._prepare_figure_text(chunk)
        else:
            return self._prepare_general_text(chunk)
    
    def _prepare_equation_text(self, chunk: MultimodalChunk) -> str:
        """تحضير نص المعادلة للـ embedding"""
        # التركيز على: اللاتكس + المتغيرات + السياق
        latex = chunk.metadata.get('latex', '')
        variables = ' '.join(chunk.metadata.get('variables', []))
        context = chunk.metadata.get('context', '')
        section = chunk.metadata.get('section', '')
        
        return f"Equation: {latex} Variables: {variables} Context: {context} Section: {section}"
    
    def _prepare_table_text(self, chunk: MultimodalChunk) -> str:
        """تحضير نص الجدول للـ embedding"""
        # التركيز على: caption + headers + بعض البيانات
        caption = chunk.metadata.get('caption', '')
        headers = ' '.join(chunk.metadata.get('headers', []))
        context = chunk.metadata.get('context', '')
        
        # أخذ أول 500 حرف من الـ markdown
        markdown = chunk.metadata.get('markdown', '')[:500]
        
        return f"Table: {caption} Headers: {headers} Data: {markdown} Context: {context}"
    
    def _prepare_figure_text(self, chunk: MultimodalChunk) -> str:
        """تحضير نص الصورة للـ embedding"""
        caption = chunk.metadata.get('caption', '')
        context = chunk.metadata.get('context', '')
        section = chunk.metadata.get('section', '')
        
        return f"Figure: {caption} Context: {context} Section: {section}"
    
    def _prepare_general_text(self, chunk: MultimodalChunk) -> str:
        """تحضير نص عام للـ embedding"""
        # استخدام النص كما هو مع إضافة keywords
        keywords = ' '.join(chunk.metadata.get('keywords', []))
        section = chunk.metadata.get('section', '')
        
        return f"{chunk.text} Keywords: {keywords} Section: {section}"


if __name__ == "__main__":
    print("✅ SpecializedChunker & Embedder V2.0 Ready")
    print("\nFeatures:")
    print("  - Separate chunking strategies per content type")
    print("  - Rich metadata extraction")
    print("  - Context-aware chunking")
    print("  - Priority-based scoring")
    print("  - Specialized embedding preparation")
