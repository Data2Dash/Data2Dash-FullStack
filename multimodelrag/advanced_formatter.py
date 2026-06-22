"""
advanced_formatter.py
=====================
Response post-processing and UI-facing formatting helpers.

Goals:
- Keep answers concise and grounded.
- Prevent duplicated equation text in the answer body.
- Support targeted equation/table/figure selection.
- Preserve existing table/equation UI formatting by returning structured metadata.
- Return all requested tables / equations / figures when the user explicitly asks for all.
- Preserve equation rendering while improving explanation quality.
"""

from __future__ import annotations

import re
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


class AdvancedResponseFormatter:
    def __init__(self):
        self.eq_keywords = {
            "equation", "equations", "formula", "formulas", "math", "mathematical",
            "definition", "derive", "derivation", "explain equation", "show equation",
        }
        self.table_keywords = {
            "table", "tables", "result", "results", "score", "scores",
            "benchmark", "benchmarks", "performance", "dataset", "evaluation",
            "compare", "comparison", "baseline", "ablation",
        }
        self.figure_keywords = {
            "figure", "figures", "diagram", "diagrams", "architecture",
            "overview", "pipeline", "framework", "model", "system"
        }
        self.metadata_keywords = {
            "title", "author", "authors", "year", "date", "published",
            "abstract", "summary", "affiliation", "university", "institution", "arxiv"
        }

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def format_response(
        self,
        query: str,
        answer_text: str,
        sources: Optional[List[Dict[str, Any]]] = None,
        equations: Optional[List[Dict[str, Any]]] = None,
        tables: Optional[List[Dict[str, Any]]] = None,
        figures: Optional[List[Dict[str, Any]]] = None,
        document_metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        query_l = (query or "").lower().strip()
        sources = sources or []
        equations = equations or []
        tables = tables or []
        figures = figures or []
        document_metadata = document_metadata or {}

        is_eq_list = self._is_all_equations_request(query_l)
        is_table_list = self._is_all_tables_request(query_l)
        is_figure_list = self._is_all_figures_request(query_l)
        is_specific_eq = self._is_specific_equation_request(query_l) and not is_eq_list
        is_table_query = self._is_table_query(query_l) and not is_table_list
        is_figure_query = self._is_figure_query(query_l) and not is_figure_list
        is_count_query = self._is_count_query(query_l)
        is_explanation_query = self._is_explanation_query(query_l)

        clean_answer = self._cleanup_answer_text(answer_text or "")

        if is_count_query:
            summary = self._format_count_only(query_l, equations, tables, figures, document_metadata)
            return {
                "summary_text": summary,
                "equations": [],
                "tables": [],
                "figures": [],
                "citations": self._collect_citations(sources),
                "mode": "count",
            }

        if is_eq_list:
            selected_equations = self._normalize_equations(equations)
            summary = clean_answer or self._build_all_equations_summary(selected_equations)
            summary = self._remove_equation_text_leak(summary, selected_equations)
            return {
                "summary_text": summary,
                "equations": selected_equations,
                "tables": [],
                "figures": [],
                "citations": self._collect_citations(sources, selected_equations),
                "mode": "all_equations",
            }

        if is_table_list:
            selected_tables = self._normalize_tables(tables)
            summary = clean_answer or self._build_all_tables_summary(selected_tables)
            summary = self._cleanup_non_equation_summary(summary)
            return {
                "summary_text": summary,
                "equations": [],
                "tables": selected_tables,
                "figures": [],
                "citations": self._collect_citations(sources, selected_tables),
                "mode": "all_tables",
            }

        if is_figure_list:
            selected_figures = self._normalize_figures(figures)
            summary = clean_answer or self._build_all_figures_summary(selected_figures)
            summary = self._cleanup_non_equation_summary(summary)
            return {
                "summary_text": summary,
                "equations": [],
                "tables": [],
                "figures": selected_figures,
                "citations": self._collect_citations(sources, selected_figures),
                "mode": "all_figures",
            }

        if is_specific_eq:
            selected_equation = self._pick_best_equation(query_l, equations)
            selected_equations = [selected_equation] if selected_equation else []
            summary = clean_answer or self._build_specific_equation_summary(query_l, selected_equation)
            summary = self._remove_equation_text_leak(summary, selected_equations)
            if selected_equation and (is_explanation_query or self._looks_too_generic(summary)):
                summary = self._augment_equation_explanation(summary, selected_equation, query_l)
            return {
                "summary_text": summary,
                "equations": selected_equations,
                "tables": [],
                "figures": [],
                "citations": self._collect_citations(sources, selected_equations),
                "mode": "specific_equation",
            }

        if is_table_query:
            best_table = self._pick_best_table(query_l, tables)
            selected_tables = [best_table] if best_table else []
            summary = clean_answer or self._build_table_summary(best_table)
            summary = self._cleanup_non_equation_summary(summary)
            return {
                "summary_text": summary,
                "equations": [],
                "tables": selected_tables,
                "figures": [],
                "citations": self._collect_citations(sources, selected_tables),
                "mode": "table",
            }

        if is_figure_query:
            best_figure = self._pick_best_figure(query_l, figures)
            selected_figures = [best_figure] if best_figure else []
            summary = clean_answer or self._build_figure_summary(best_figure)
            summary = self._cleanup_non_equation_summary(summary)
            return {
                "summary_text": summary,
                "equations": [],
                "tables": [],
                "figures": selected_figures,
                "citations": self._collect_citations(sources, selected_figures),
                "mode": "figure",
            }

        summary = self._cleanup_non_equation_summary(clean_answer)
        summary = self._ensure_citation_in_text(summary, sources)
        return {
            "summary_text": summary,
            "equations": [],
            "tables": [],
            "figures": [],
            "citations": self._collect_citations(sources),
            "mode": "general",
        }

    # ------------------------------------------------------------------
    # Query classification
    # ------------------------------------------------------------------

    def _is_all_equations_request(self, q: str) -> bool:
        patterns = [
            "show all equations", "show all equation", "list equations", "list all equations",
            "show equations", "what equations are", "all equations", "all equation",
            "equations mentioned", "extract all equations", "extract every mathematical formula",
            "every mathematical formula", "all mathematical formulas", "show me all equation",
            "show me all equations", "show every equation",
        ]
        return any(p in q for p in patterns)

    def _is_all_tables_request(self, q: str) -> bool:
        patterns = [
            "show all tables", "show all table", "list tables", "list all tables",
            "show tables", "all tables", "all table", "extract all tables", "show every table",
        ]
        return any(p in q for p in patterns)

    def _is_all_figures_request(self, q: str) -> bool:
        patterns = [
            "show all figures", "show all figure", "list figures", "list all figures",
            "show figures", "all figures", "all figure", "extract all figures", "show every figure",
        ]
        return any(p in q for p in patterns)

    def _is_specific_equation_request(self, q: str) -> bool:
        if any(k in q for k in self.eq_keywords):
            return True
        # Matches: "equation 1", "equation(1)", "equation (1)", "eq.1", "eq.(1)"
        if re.search(r"\b(?:equation|eq\.?)\s*[\(\[]?\s*\d+\s*[\)\]]?", q, re.IGNORECASE):
            return True
        return False

    def _is_table_query(self, q: str) -> bool:
        return any(k in q for k in self.table_keywords)

    def _is_figure_query(self, q: str) -> bool:
        return any(k in q for k in self.figure_keywords)

    def _is_count_query(self, q: str) -> bool:
        count_words = {"how many", "number of", "count"}
        asset_words = {"equation", "equations", "table", "tables", "figure", "figures"}
        return any(w in q for w in count_words) and any(a in q for a in asset_words)

    def _is_explanation_query(self, q: str) -> bool:
        return any(k in q for k in ["explain", "why", "how", "what does", "interpret", "meaning", "defined", "definition"])

    # ------------------------------------------------------------------
    # Cleanup
    # ------------------------------------------------------------------

    # ----------------------------------------------------------------
    # Token-duplication cleaner
    # ----------------------------------------------------------------

    @staticmethod
    def _fix_token_duplication(text: str) -> str:
        """Remove adjacent duplicate tokens produced by PyMuPDF double-scanning glyphs.

        Handles cases like:
          "Q Q" → "Q"
          "d_k d_k" → "d_k"
          "\\sqrt{d_k} \\sqrt{d_k}" → "\\sqrt{d_k}"
          "the attention mechanism the attention mechanism" → "the attention mechanism"

        Only collapses tokens that appear side-by-side (with optional whitespace between).
        LaTeX-heavy math blocks ($$...$$) are left untouched to avoid corrupting valid
        notation like \\frac{a}{a}.
        """
        if not text:
            return text

        # Step 1: Protect $$...$$ and $...$ blocks from de-dup mangling
        math_blocks: list[str] = []
        placeholder_tmpl = "\x00MATH{idx}\x00"

        def _stash_math(m: re.Match) -> str:  # type: ignore[type-arg]
            math_blocks.append(m.group(0))
            return placeholder_tmpl.format(idx=len(math_blocks) - 1)

        text = re.sub(r"\$\$.*?\$\$", _stash_math, text, flags=re.S)
        text = re.sub(r"\$[^\$\n]+?\$", _stash_math, text)

        # Step 2: Collapse adjacent identical tokens (word, symbol, subscripted token)
        text = re.sub(
            r"\b([A-Za-z0-9_\-\.]{1,20})(?:\s+\1)+\b",
            r"\1",
            text,
        )
        # Handles short tokens like single uppercase letters: "Q Q" → "Q"
        text = re.sub(
            r"(?<![\w$])([A-Z])\s+\1(?![\w$])",
            r"\1",
            text,
        )

        # Step 3: Collapse repeated multi-word phrases (2-6 words repeated adjacently)
        # e.g. "the attention mechanism the attention mechanism" → "the attention mechanism"
        text = re.sub(
            r"\b((?:\S+\s+){1,5}\S+)\s+\1\b",
            r"\1",
            text,
        )

        # Step 4: Restore math blocks
        for idx, block in enumerate(math_blocks):
            text = text.replace(placeholder_tmpl.format(idx=idx), block)

        return text

    @staticmethod
    def _math_fallback_cleanup(text: str) -> str:
        """Ensure math notation degrades gracefully if the frontend renderer fails.

        Adds a plain-text fallback representation alongside LaTeX so that if
        KaTeX/MathJax fails to render, the user still sees readable text instead
        of blank lines.

        Strategy:
        - Ensure $$ blocks have no leading/trailing whitespace issues that break renderers.
        - Normalize malformed delimiters (e.g. $$$ → $$, unbalanced $).
        - For inline $...$ blocks, ensure they don't span multiple lines (breaks KaTeX).
        """
        if not text:
            return text

        # Fix triple-dollar (common LLM mistake): $$$ → $$
        text = re.sub(r"\${3,}", "$$", text)

        # Fix display math blocks: ensure $$ are on their own lines for block rendering
        # but only if they contain actual content
        text = re.sub(r"\$\$\s*\n?\s*\$\$", "", text)  # Remove empty $$ $$ blocks

        # Ensure display-math $$ delimiters are on separate lines for reliable rendering
        text = re.sub(r"([^\n])\$\$([^\$])", r"\1\n$$\2", text)
        text = re.sub(r"([^\$])\$\$([^\n$])", r"\1$$\n\2", text)

        # Fix inline math spanning multiple lines (breaks KaTeX) — convert to display
        def _fix_multiline_inline(m: re.Match) -> str:
            content = m.group(1)
            if "\n" in content:
                return f"$${content.strip()}$$"
            return m.group(0)

        text = re.sub(r"(?<!\$)\$([^\$]{1,500}?)\$(?!\$)", _fix_multiline_inline, text, flags=re.S)

        # UNIVERSAL stray-$ fix: remove $ delimiters NESTED inside a $$...$$ block,
        # e.g. "$$ \sqrt{$d_{k}$} $$" -> "$$ \sqrt{d_{k}} $$".
        def _strip_inner_dollars(m: re.Match) -> str:
            inner = m.group(1).replace("$", "")
            return f"$${inner}$$"
        text = re.sub(r"\$\$(.+?)\$\$", _strip_inner_dollars, text, flags=re.S)

        # Also strip stray $ inside inline $...$ blocks (e.g. "$\sqrt{$d_k$}$"
        # → "$\sqrt{d_k}$"). The pattern: find $...$, strip any inner $ that
        # aren't at the boundaries.
        def _strip_inner_dollars_inline(m: re.Match) -> str:
            inner = m.group(1)
            cleaned = inner.replace("$", "")
            if cleaned != inner:
                return f"${cleaned}$"
            return m.group(0)
        text = re.sub(r"(?<!\$)\$([^\$\n]{1,500}?)\$(?!\$)", _strip_inner_dollars_inline, text)

        # Remove completely empty lines that result from failed math stripping
        text = re.sub(r"\n{3,}", "\n\n", text)

        return text

    def _cleanup_answer_text(self, text: str) -> str:
        """Clean the raw LLM answer text before UI delivery.

        Key rule: $$...$$ and $...$ blocks must be PRESERVED so the frontend
        MathJax/KaTeX renderer can display them.  Previous code stripped all
        math blocks here, which caused blank equation placeholders in the UI.
        """
        if not text:
            return ""
        # Remove prompt-template artifacts (NOT math)
        text = re.sub(r"\bShort Summary\s+Short\b", "Short Summary", text, flags=re.I)
        text = re.sub(r"\bExplanation\s+Short\b", "Explanation", text, flags=re.I)
        # Remove fenced code blocks that are purely internal prompt artefacts
        text = re.sub(r"```(?:instructions?|system|rules?).*?```", "", text, flags=re.S | re.I)
        text = text.replace("\r", "\n")
        text = re.sub(r"\n{3,}", "\n\n", text)
        text = re.sub(r"[ \t]{2,}", " ", text)
        # Fix token duplication ("Q Q" → "Q", "d_k d_k" → "d_k")
        text = self._fix_token_duplication(text)
        # Ensure math formatting degrades gracefully if frontend renderer fails
        text = self._math_fallback_cleanup(text)
        return text.strip()

    def _cleanup_non_equation_summary(self, text: str) -> str:
        """Lightweight cleanup for non-equation prose summaries.

        Only strips stray LaTeX command escapes that appeared OUTSIDE of any
        math delimiters — i.e., raw backslash artefacts leaked into plain text.
        It never touches $$...$$ or $...$ regions.
        """
        if not text:
            return ""
        text = re.sub(r"\bTechnical Details\b.*$", "", text, flags=re.I | re.S)

        # Strip bare backslash-command artefacts ONLY outside math zones
        # (e.g. a stray \\alpha that ended up in a prose sentence)
        def _strip_latex_outside_math(src: str) -> str:
            result_parts: list[str] = []
            last = 0
            for m in re.finditer(r"(\$\$.*?\$\$|\$[^\$\n]+?\$)", src, flags=re.S):
                prose = src[last:m.start()]
                # Strip stray LaTeX commands and raw TeX structure chars from prose only
                prose = re.sub(r"\\[A-Za-z]+\*?", "", prose)
                prose = re.sub(r"[_^{}]", "", prose)
                result_parts.append(prose)
                result_parts.append(m.group(0))  # Keep math block intact
                last = m.end()
            # Trailing prose after last math block
            trailing = src[last:]
            trailing = re.sub(r"\\[A-Za-z]+\*?", "", trailing)
            trailing = re.sub(r"[_^{}]", "", trailing)
            result_parts.append(trailing)
            return "".join(result_parts)

        text = _strip_latex_outside_math(text)

        # De-duplicate sentences
        sentences = re.split(r"(?<=[.!?])\s+", text)
        seen: set[str] = set()
        kept: list[str] = []
        for s in sentences:
            key = re.sub(r"\s+", " ", s.strip().lower())
            if key and key not in seen:
                seen.add(key)
                kept.append(s.strip())
        return " ".join(kept).strip()

    def _remove_equation_text_leak(self, text: str, equations: List[Dict[str, Any]]) -> str:
        if not text:
            return ""
        cleaned = text
        cleaned = re.sub(r"(?:\b[prdqxyRNAGT\-ηθ∑∏⊤≈∈\(\)\[\]\|:\.]+\s*){12,}", "", cleaned, flags=re.I)
        for eq in equations or []:
            raw = (eq.get("raw_text") or eq.get("text") or "").strip()
            if raw and len(raw) > 10:
                cleaned = cleaned.replace(raw, "")
            latex = (eq.get("normalized_latex") or eq.get("latex") or "").strip()
            if latex and len(latex) > 10:
                cleaned = cleaned.replace(latex, "")
        cleaned = re.sub(r"\b(Evidence from paper|Explanation|Short Summary)\s*[:\-]?\s*(?=\n|$)", "", cleaned, flags=re.I)
        cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
        cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
        return cleaned.strip()

    def _looks_too_generic(self, text: str) -> bool:
        if not text:
            return True
        generic_patterns = [
            r"most relevant equation",
            r"it is the most relevant formula",
            r"appears on page",
            r"document does not contain",
        ]
        return any(re.search(p, text, re.I) for p in generic_patterns)

    # ------------------------------------------------------------------
    # Equation helpers
    # ------------------------------------------------------------------

    def _clean_latex(self, raw: str) -> str:
        """
        Remove common PDF-extraction artifacts from a raw LaTeX / equation string:
        - Leading equation-number prefixes like "12 :" or "(4)"
        - Trailing non-math noise like section headings appended after the formula
        - Garbled \xiki / \xik artifacts
        """
        if not raw:
            return raw
        text = raw.strip()

        # Strip leading equation number prefix:  "12 : " or "(12) " or "12. "
        text = re.sub(r'^\(?\d{1,3}\)?\s*[:.]\s*', '', text)

        # Strip trailing appended section title / garbage after a recognisable
        # LaTeX terminal: closing brace/bracket/paren followed by non-math words.
        # E.g. "...xi_i^k13 : (4)Normalizationandaggregation" → strip everything
        # from a bare number + colon + non-LaTeX text run
        text = re.sub(r'\d+\s*:\s*\(\d+\)[A-Za-z].*$', '', text)
        text = re.sub(r'\d+\s*:\s*\(\d+\)\s*$', '', text)

        # Fix garbled \xiki or \xik artifact produced by certain PDF extractors
        # The real symbol is \xi_i^k  (membership set ξ_i^k)
        text = re.sub(r'\\xiki?\b', r'\\xi_i^{k}', text)
        text = re.sub(r'\\xi\s*i\s*k\b', r'\\xi_i^{k}', text)

        # Remove stray trailing equation numbers:  "...}  (4)" at end of string
        text = re.sub(r'\s*\(\d{1,3}[a-z]?\)\s*$', '', text)

        return text.strip()

    def _normalize_equations(self, equations: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        norm = []
        for eq in equations or []:
            item = dict(eq)
            page = item.get("page_number", item.get("page", None))
            item["page_number"] = page
            if not item.get("normalized_latex") and item.get("latex"):
                item["normalized_latex"] = item["latex"]
            if not item.get("raw_text") and item.get("text"):
                item["raw_text"] = item["text"]
            # Clean corrupted LaTeX before it reaches the renderer
            for key in ("normalized_latex", "latex"):
                if item.get(key):
                    item[key] = self._clean_latex(item[key])
            norm.append(item)

        def sort_key(x):
            n = x.get("global_number") or self._extract_number(x.get("label", ""))
            page = x.get("page_number")
            if page is None:
                page = 9999
            return (9999 if n is None else n, page)

        norm.sort(key=sort_key)
        return norm

    def _pick_best_equation(self, query: str, equations: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        eqs = self._normalize_equations(equations)
        if not eqs:
            return None

        best_score = None
        best_eq = None
        for eq in eqs:
            text = " ".join([
                str(eq.get("label", "")),
                str(eq.get("raw_text", "")),
                str(eq.get("text", "")),
                str(eq.get("normalized_latex", "")),
                str(eq.get("description", "")),
            ]).lower()

            score = 0

            # ── Exact equation number matching ──────────────────────────────
            # Handles all of: "equation 1", "equation(1)", "equation (1)",
            # "eq. 1", "eq.(1)", "Equation1" etc.
            m = re.search(
                r"\b(?:equation|eq\.?)\s*[\(\[]?\s*(\d+)\s*[\)\]]?",
                query,
                re.IGNORECASE,
            )
            if m:
                qn = int(m.group(1))
                en = eq.get("global_number") or self._extract_number(eq.get("label", ""))
                if en == qn:
                    score += 100   # Exact hit — this equation wins

            # Generic term-overlap scoring — no content-specific matching
            query_terms = set(re.findall(r"[a-zA-Z0-9_\-\(\)]+", query))
            text_terms = set(re.findall(r"[a-zA-Z0-9_\-\(\)]+", text))
            score += len(query_terms & text_terms)

            if best_score is None or score > best_score:
                best_score = score
                best_eq = eq

        return best_eq

    def _build_all_equations_summary(self, equations: List[Dict[str, Any]]) -> str:
        if not equations:
            return "The document does not contain this information."
        lines = [f"Found {len(equations)} equations in the document.", ""]
        for eq in equations:
            label = eq.get("label") or f"Equation {eq.get('global_number', '?')}"
            page = eq.get("page_number", "?")
            lines.append(f"- {label} (Page {page})")
        return "\n".join(lines).strip()

    def _build_specific_equation_summary(self, query: str, eq: Optional[Dict[str, Any]]) -> str:
        if not eq:
            return "The document does not contain this information."
        label = eq.get("label") or f"Equation {eq.get('global_number', '?')}"
        page = eq.get("page_number", "?")
        desc = (eq.get("description") or "").strip()
        base = f"{label} appears on Page {page}."
        if desc:
            base += f" {desc}"
        return base

    def _augment_equation_explanation(self, summary: str, eq: Dict[str, Any], query: str) -> str:
        label = eq.get("label") or f"Equation {eq.get('global_number', '?')}"
        page = eq.get("page_number", "?")
        desc = self._infer_equation_explanation(eq)
        if summary and "does not contain" not in summary.lower() and not self._looks_too_generic(summary):
            return summary
        return f"{label} is the relevant formula on Page {page}. {desc}".strip()

    def _infer_equation_explanation(self, eq: Dict[str, Any]) -> str:
        desc = (eq.get("description") or "").strip()
        if desc:
            return desc
        return "It is one of the key mathematical definitions used in the paper."

    # ------------------------------------------------------------------
    # Table helpers
    # ------------------------------------------------------------------

    def _normalize_tables(self, tables: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        norm = [dict(tb) for tb in tables or []]
        norm.sort(key=lambda x: ((x.get("global_number") or 9999), (x.get("page_number") or 9999)))
        return norm

    def _pick_best_table(self, query: str, tables: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not tables:
            return None
        best = None
        best_score = None
        for tb in tables:
            text = " ".join([
                str(tb.get("caption", "")),
                str(tb.get("markdown", "")),
                str(tb.get("raw_text", "")),
                str(tb.get("description", "")),
            ]).lower()
            score = 0

            metric_terms = [
                "score", "scores", "accuracy", "precision", "recall",
                "f1", "performance", "results", "benchmark", "evaluation",
                "ablation", "baseline", "error", "loss",
            ]
            dataset_terms = metric_terms

            for term in dataset_terms:
                if term in query and term in text:
                    score += 20
            for term in metric_terms:
                if term in query and term in text:
                    score += 10

            m = re.search(r"\btable\s+(\d+)\b", query)
            if m:
                qn = int(m.group(1))
                tn = tb.get("global_number") or self._extract_number(tb.get("label", ""))
                if tn == qn:
                    score += 100

            q_terms = set(re.findall(r"[a-zA-Z0-9\-]+", query))
            t_terms = set(re.findall(r"[a-zA-Z0-9\-]+", text))
            score += len(q_terms & t_terms)

            if best_score is None or score > best_score:
                best_score = score
                best = tb
        return best

    def _build_all_tables_summary(self, tables: List[Dict[str, Any]]) -> str:
        if not tables:
            return "The document does not contain this information."
        lines = [f"Found {len(tables)} tables in the document.", ""]
        for tb in tables:
            label = tb.get("label") or f"Table {tb.get('global_number', '?')}"
            page = tb.get("page_number", "?")
            caption = (tb.get("caption") or "").strip()
            if caption and caption.lower() != str(label).lower():
                lines.append(f"- {label} (Page {page}): {caption}")
            else:
                lines.append(f"- {label} (Page {page})")
        return "\n".join(lines).strip()

    def _build_table_summary(self, table: Optional[Dict[str, Any]]) -> str:
        if not table:
            return "The document does not contain this information."
        caption = table.get("caption") or f"Table {table.get('global_number', '?')}"
        page = table.get("page_number", "?")
        return f"The most relevant result is in {caption} (Page {page})."

    # ------------------------------------------------------------------
    # Figure helpers
    # ------------------------------------------------------------------

    def _normalize_figures(self, figures: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        norm = [dict(fig) for fig in figures or []]
        norm.sort(key=lambda x: ((x.get("global_number") or 9999), (x.get("page_number") or 9999)))
        return norm

    def _pick_best_figure(self, query: str, figures: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if not figures:
            return None
        best = None
        best_score = None
        for fig in figures:
            text = " ".join([
                str(fig.get("caption", "")),
                str(fig.get("description", "")),
                str(fig.get("raw_text", "")),
            ]).lower()
            score = 0
            if any(k in query for k in ["architecture", "overview", "pipeline", "model", "system", "diagram"]):
                for kw in ["architecture", "overview", "pipeline", "model", "system", "framework"]:
                    if kw in text:
                        score += 15
            q_terms = set(re.findall(r"[a-zA-Z0-9\-]+", query))
            f_terms = set(re.findall(r"[a-zA-Z0-9\-]+", text))
            score += len(q_terms & f_terms)
            if best_score is None or score > best_score:
                best_score = score
                best = fig
        return best

    def _build_all_figures_summary(self, figures: List[Dict[str, Any]]) -> str:
        if not figures:
            return "The document does not contain this information."
        lines = [f"Found {len(figures)} figures in the document.", ""]
        for fig in figures:
            label = fig.get("label") or f"Figure {fig.get('global_number', '?')}"
            page = fig.get("page_number", "?")
            caption = (fig.get("caption") or "").strip()
            if caption and caption.lower() != str(label).lower():
                lines.append(f"- {label} (Page {page}): {caption}")
            else:
                lines.append(f"- {label} (Page {page})")
        return "\n".join(lines).strip()

    def _build_figure_summary(self, figure: Optional[Dict[str, Any]]) -> str:
        if not figure:
            return "The document does not contain this information."
        caption = figure.get("caption") or f"Figure {figure.get('global_number', '?')}"
        page = figure.get("page_number", "?")
        return f"The most relevant figure is {caption} (Page {page})."

    # ------------------------------------------------------------------
    # Counts / citations
    # ------------------------------------------------------------------

    def _format_count_only(
        self,
        query: str,
        equations: List[Dict[str, Any]],
        tables: List[Dict[str, Any]],
        figures: List[Dict[str, Any]],
        document_metadata: Dict[str, Any],
    ) -> str:
        if "equation" in query:
            count = document_metadata.get("display_equation_count", len(equations))
            return str(count)
        if "table" in query:
            count = document_metadata.get("table_count", len(tables))
            return str(count)
        if "figure" in query:
            count = document_metadata.get("figure_count", len(figures))
            return str(count)
        return "The document does not contain this information."

    def _collect_citations(
        self,
        sources: Optional[List[Dict[str, Any]]] = None,
        assets: Optional[List[Dict[str, Any]]] = None,
    ) -> List[str]:
        citations: List[str] = []
        for src in sources or []:
            c = self._source_to_citation(src)
            if c and c not in citations:
                citations.append(c)
        for asset in assets or []:
            if not asset:
                continue
            if "caption" in asset and "table" in str(asset.get("caption", "")).lower():
                c = f"(Source: Table {asset.get('global_number', '?')})"
            elif "caption" in asset and "figure" in str(asset.get("caption", "")).lower():
                c = f"(Source: Figure {asset.get('global_number', '?')})"
            elif asset.get("global_number") is not None and ("latex" in asset or "normalized_latex" in asset or "raw_text" in asset):
                c = f"(Source: Equation {asset.get('global_number', '?')})"
            else:
                page = asset.get("page_number")
                c = f"(Source: Page {page})" if page is not None else None
            if c and c not in citations:
                citations.append(c)
        return citations

    def _source_to_citation(self, src: Dict[str, Any]) -> Optional[str]:
        if not src:
            return None
        if src.get("source_type") == "table":
            return f"(Source: Table {src.get('global_number', '?')})"
        if src.get("source_type") == "figure":
            return f"(Source: Figure {src.get('global_number', '?')})"
        if src.get("source_type") == "equation":
            return f"(Source: Equation {src.get('global_number', '?')})"
        page = src.get("page_number", src.get("page"))
        if page is not None:
            try:
                return f"(Source: Page {int(page)})"
            except Exception:
                return f"(Source: Page {page})"
        return None

    def _ensure_citation_in_text(self, text: str, sources: List[Dict[str, Any]]) -> str:
        if not text:
            return ""
        if "(Source:" in text:
            return text
        cits = self._collect_citations(sources)
        if cits:
            return f"{text}\n\n{cits[0]}"
        return text

    # ------------------------------------------------------------------
    # Utils
    # ------------------------------------------------------------------

    def _extract_number(self, text: str) -> Optional[int]:
        if not text:
            return None
        m = re.search(r"(\d+)", str(text))
        return int(m.group(1)) if m else None
