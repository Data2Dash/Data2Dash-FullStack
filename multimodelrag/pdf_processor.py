"""
pdf_processor_v2.py - Production PDF Processor (THE PARAGRAPH KILLER)
=====================================================================
✅ Paragraph Killer (Stops extracting when it hits paragraph text)
✅ Layout Engine (Perfect spatial representation)
✅ Column-Cropping (Prevents Table 1 & 2 from merging)
"""

import os
import re
import uuid
import logging
from typing import List, Dict, Any, Tuple, Optional
from dataclasses import dataclass
import fitz  # PyMuPDF
import pdfplumber

from multimodal_models import ProcessedDocument, ProcessedEquation, ProcessedTable, ProcessedFigure

logger = logging.getLogger(__name__)

# BOOT MARKER — confirms the live server loaded THIS file (vision tables + eq vision)
print(f"[BOOT] pdf_processor.py loaded v=2025-table-eq-vision mtime={os.path.getmtime(__file__):.0f}")

class StrictEquationDetector:
    STRONG_OPERATORS = ['=', '≈', '≤', '≥', '∫', '∑', '∏', '∝', '→', '∈']
    
    @classmethod
    def is_equation(cls, text: str, bbox: Tuple[float, float, float, float] = None) -> bool:
        text = text.strip()
        if len(text) < 8 or len(text) > 300:
            return False
        if re.search(r'(https?://|www\.|doi:|arxiv:|github\.com|\.pdf)', text, re.IGNORECASE):
            return False
        if re.match(r'^\[\d+\]', text):
            return False
        if re.match(r'^\s*(Figure|Fig|Table|Appendix|Algorithm|Listing)\b', text, re.IGNORECASE):
            return False
        if 'id=' in text.lower() or 'id =' in text.lower():
            return False
        if text.startswith(')'):
            return False
        if not any(op in text for op in cls.STRONG_OPERATORS):
            return False

        words = re.findall(r'\b[a-zA-Z]{2,}\b', text)
        if len(words) > 6:
            return False
        return True

    @classmethod
    def extract_latex_from_text(cls, text: str) -> Optional[str]:
        if '\\' in text:
            return text
        latex = text.replace('\n', ' ')
        greek_map = {
            'α': r'\alpha ',
            'β': r'\beta ',
            'γ': r'\gamma ',
            'δ': r'\delta ',
            'η': r'\eta ',
            'θ': r'\theta ',
            'λ': r'\lambda ',
            'μ': r'\mu ',
        }
        for greek, tex in greek_map.items():
            latex = latex.replace(greek, tex)

        latex = re.sub(r'≈\s*X', r'\\approx \\sum', latex)
        latex = re.sub(r'=\s*X', r'= \\sum', latex)
        latex = latex.replace('∑', r'\sum ').replace('∏', r'\prod ')

        latex = latex.replace('\ufffd', '').replace('\x01', '').replace('\x00', '')
        latex = latex.replace('exp  d(z)', 'exp(d(z))').replace('exp d(z)', 'exp(d(z))')
        return latex.strip()


class TableDetector:

    @staticmethod
    def _cells_to_markdown(rows: List[List[Any]]) -> str:
        """Convert a list-of-rows to GitHub-flavored markdown table.
        Handles multi-level headers by flattening parent→child column names.
        """
        def clean(cell):
            if cell is None:
                return ""
            return re.sub(r'\s+', ' ', str(cell)).strip()

        norm = [[clean(c) for c in row] for row in rows if any(c for c in row)]
        if not norm:
            return ""

        ncols = max(len(r) for r in norm)
        norm = [r + [""] * (ncols - len(r)) for r in norm]

        # Detect multi-level headers: if the first row has many empty cells
        # (merged spans) and the second row has sub-labels, flatten them.
        header_rows = []
        data_start = 0

        for i, row in enumerate(norm[:3]):  # Check first 3 rows max
            non_empty = sum(1 for c in row if c)
            if i == 0:
                header_rows.append(row)
                data_start = 1
            elif non_empty > 0 and non_empty < ncols:
                # Possible sub-header row — check it's not all numeric (data)
                has_only_numbers = all(
                    re.match(r'^[\d\.\-\+\s,%]*$', c) for c in row if c
                )
                if not has_only_numbers:
                    header_rows.append(row)
                    data_start = i + 1
                else:
                    break
            else:
                break

        # Flatten multi-level headers
        if len(header_rows) == 1:
            flat_header = header_rows[0]
        else:
            flat_header = []
            parent_row = header_rows[0]
            child_row = header_rows[1] if len(header_rows) > 1 else [""] * ncols

            # Forward-fill parent headers (they span multiple sub-columns)
            filled_parent = []
            last_parent = ""
            for cell in parent_row:
                if cell:
                    last_parent = cell
                filled_parent.append(last_parent)

            for col_i in range(ncols):
                parent = filled_parent[col_i] if col_i < len(filled_parent) else ""
                child = child_row[col_i] if col_i < len(child_row) else ""
                if parent and child and parent.lower() != child.lower():
                    flat_header.append(f"{parent} ({child})")
                elif child:
                    flat_header.append(child)
                elif parent:
                    flat_header.append(parent)
                else:
                    flat_header.append("")

        data_rows_list = norm[data_start:]

        # Format
        all_rows = [flat_header] + data_rows_list
        widths = [max(len(all_rows[r][i]) for r in range(len(all_rows))) for i in range(ncols)]
        widths = [max(w, 3) for w in widths]

        def fmt_row(row):
            return "| " + " | ".join((row[i] if i < len(row) else "").ljust(widths[i]) for i in range(ncols)) + " |"

        header_line = fmt_row(flat_header)
        separator = "| " + " | ".join("-" * widths[i] for i in range(ncols)) + " |"
        data_lines = [fmt_row(r) for r in data_rows_list]

        return "\n".join([header_line, separator] + data_lines)

    @staticmethod
    def _fitz_blocks_to_markdown(fitz_page, crop_box: Tuple[float, float, float, float]) -> str:
        """Fast table extraction using PyMuPDF's get_text('dict') — no pdfplumber needed.
        Uses character-level bounding boxes for precise column detection.
        """
        x0, y0, x1, y1 = crop_box
        clip = fitz.Rect(x0, y0, x1, y1)
        page_dict = fitz_page.get_text("dict", clip=clip, flags=fitz.TEXT_PRESERVE_WHITESPACE)

        words: List[Dict] = []
        for block in page_dict.get("blocks", []):
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    text = span.get("text", "").strip()
                    if not text:
                        continue
                    bbox = span.get("bbox", (0, 0, 0, 0))
                    words.append({
                        "text": text,
                        "x0": bbox[0],
                        "top": bbox[1],
                        "x1": bbox[2],
                        "bottom": bbox[3],
                    })

        if len(words) < 4:
            return ""

        return TableDetector._words_to_markdown(words)

    @staticmethod
    def _words_to_markdown(words: List[Dict]) -> str:
        """Word-coordinate clustering for borderless academic tables.
        Accepts word dicts with keys: text, x0, top, x1, bottom.
        Works with both pdfplumber and PyMuPDF word formats.
        """
        if not words:
            return ""

        words_sorted = sorted(words, key=lambda w: (w["top"], w["x0"]))

        # Adaptive ROW_GAP from median line spacing
        y_positions = sorted(set(round(w["top"]) for w in words_sorted))
        if len(y_positions) > 2:
            y_gaps = [y_positions[i+1] - y_positions[i] for i in range(len(y_positions)-1)]
            y_gaps_filtered = [g for g in y_gaps if g > 0]
            if y_gaps_filtered:
                median_gap = sorted(y_gaps_filtered)[len(y_gaps_filtered) // 2]
                ROW_GAP = max(6, min(median_gap * 0.6, 14))
            else:
                ROW_GAP = 8
        else:
            ROW_GAP = 8

        rows_of_words: List[List[Dict]] = []
        cur_row: List[Dict] = []
        prev_top = None

        for w in words_sorted:
            if prev_top is None or abs(w["top"] - prev_top) <= ROW_GAP:
                cur_row.append(w)
            else:
                if cur_row:
                    rows_of_words.append(sorted(cur_row, key=lambda x: x["x0"]))
                cur_row = [w]
            prev_top = w["top"]
        if cur_row:
            rows_of_words.append(sorted(cur_row, key=lambda x: x["x0"]))

        if len(rows_of_words) < 2:
            return ""

        def looks_like_prose_row(row: List[Dict]) -> bool:
            texts = [w["text"] for w in row]
            total_chars = sum(len(t) for t in texts)
            full_text = " ".join(texts)
            if len(texts) == 1:
                t = texts[0]
                if len(t) > 15:
                    alpha = sum(c.isalpha() for c in t)
                    digits = sum(c.isdigit() for c in t)
                    if alpha / len(t) > 0.80 and digits < 3:
                        return True
            if total_chars > 60:
                digit_count = sum(c.isdigit() for t in texts for c in t)
                special_count = sum(1 for t in texts for c in t if c in '.-/+*%')
                if digit_count == 0 and special_count < 2:
                    return True
            # Long sentence with standard punctuation = prose
            if len(full_text) > 80 and re.search(r'[.!?]\s', full_text):
                word_count = len(full_text.split())
                if word_count > 12:
                    return True
            return False

        keep_rows: List[List[Dict]] = []
        consecutive_prose = 0
        for row in rows_of_words:
            if looks_like_prose_row(row):
                consecutive_prose += 1
                if consecutive_prose >= 1 and keep_rows:
                    break
            else:
                consecutive_prose = 0
                keep_rows.append(row)

        rows_of_words = keep_rows
        if len(rows_of_words) < 2:
            return ""

        def gaps_from_row(row: List[Dict], min_gap: float) -> List[float]:
            if not row:
                return []
            splits = []
            prev_x1 = row[0].get("x1", row[0]["x0"] + 4)
            for w in row[1:]:
                gap_start = prev_x1
                gap_end = w["x0"]
                gap_size = gap_end - gap_start
                if gap_size >= min_gap:
                    splits.append((gap_start + gap_end) / 2.0)
                prev_x1 = max(prev_x1, w.get("x1", w["x0"] + 4))
            return splits

        densest_row = max(rows_of_words, key=len)
        MIN_GAP = 4.0
        splits = gaps_from_row(densest_row, MIN_GAP)

        if not splits:
            all_splits = set()
            for row in rows_of_words:
                for s in gaps_from_row(row, MIN_GAP):
                    all_splits.add(round(s / 2) * 2)
            splits = sorted(all_splits)

        if not splits:
            return ""

        x_min = min(w["x0"] for w in words)
        x_max = max(w.get("x1", w["x0"] + 1) for w in words)
        boundaries = [x_min - 1] + splits + [x_max + 1]
        ncols = len(boundaries) - 1

        if ncols < 2:
            return ""

        def col_index(cx: float) -> int:
            for i in range(ncols):
                if boundaries[i] <= cx < boundaries[i + 1]:
                    return i
            return ncols - 1

        grid: List[List[str]] = []
        for row in rows_of_words:
            cells: List[List[str]] = [[] for _ in range(ncols)]
            for w in row:
                cx = (w["x0"] + w.get("x1", w["x0"])) / 2.0
                cells[col_index(cx)].append(w["text"])
            row_strs = [" ".join(c) for c in cells]
            if any(s for s in row_strs):
                grid.append(row_strs)

        while ncols > 1 and all(r[ncols - 1] == "" for r in grid):
            grid = [r[:-1] for r in grid]
            ncols -= 1

        if ncols < 2:
            return ""

        return TableDetector._cells_to_markdown(grid)

    @staticmethod
    def _layout_text_to_markdown(raw_text: str, paragraph_killer: bool = True) -> str:
        """Fallback: convert pdfplumber layout-text to a proper markdown table.

        Uses multi-space gaps (3+) as column delimiters to reconstruct rows
        into aligned markdown. Falls back to code-block if structure is unclear.
        """
        lines = []
        empty_streak = 0
        for line in raw_text.split('\n'):
            stripped = line.strip()
            if not stripped:
                empty_streak += 1
                if empty_streak >= 2 and lines:
                    break
                continue
            empty_streak = 0
            if paragraph_killer:
                if len(stripped) > 30 and ' ' not in stripped:
                    if lines:
                        break
                if re.match(r'^\d+\.\d+\s+[A-Z]', stripped):
                    if lines:
                        break
                alpha_ratio = sum(c.isalpha() for c in stripped) / len(stripped) if stripped else 0
                if len(stripped) > 50 and alpha_ratio > 0.85 and not re.search(r'\s{3,}', line):
                    if lines:
                        break
            lines.append(line.rstrip())

        if len(lines) < 2:
            return ""

        # Try to split lines into columns using multi-space gaps
        grid = []
        for line in lines:
            # Split on 2+ spaces (common column delimiter in layout text)
            cells = [c.strip() for c in re.split(r'\s{2,}', line) if c.strip()]
            if cells:
                grid.append(cells)

        if not grid:
            return ""

        # Check if this looks tabular (consistent column count across rows)
        col_counts = [len(r) for r in grid]
        most_common_cols = max(set(col_counts), key=col_counts.count)

        if most_common_cols >= 2:
            # Normalize all rows to same column count
            normalized = []
            for row in grid:
                if len(row) == most_common_cols:
                    normalized.append(row)
                elif len(row) < most_common_cols:
                    normalized.append(row + [""] * (most_common_cols - len(row)))
                else:
                    # Too many cols — merge last cells
                    merged = row[:most_common_cols - 1] + [" ".join(row[most_common_cols - 1:])]
                    normalized.append(merged)

            if len(normalized) >= 2:
                return TableDetector._cells_to_markdown(normalized)

        # Fallback: not tabular enough, return as code block
        return "```text\n" + "\n".join(lines) + "\n```"

    @staticmethod
    def _strip_prose_rows_from_markdown(md: str, caption: str) -> str:
        """Remove rows that are leaked prose or repeated caption text."""
        if not md or "|" not in md:
            return md
        caption_lower = (caption or "").lower().strip()
        # Extract the key caption phrase (first ~8 words after "Table N:")
        cap_words = re.sub(r'^Table\s+\d+[:\.\s]*', '', caption, flags=re.I).split()[:8]
        cap_phrase = " ".join(cap_words).lower()

        cleaned_lines = []
        for line in md.splitlines():
            stripped = line.strip()
            if not stripped:
                cleaned_lines.append(line)
                continue
            if not stripped.startswith("|"):
                cleaned_lines.append(line)
                continue
            # Check if this is a separator row — always keep
            cells = [c.strip() for c in stripped.strip("|").split("|")]
            if all(re.fullmatch(r":?-{2,}:?", c.replace(" ", "")) for c in cells if c):
                cleaned_lines.append(line)
                continue
            # Check if any cell contains prose-like text (long sentence)
            has_prose_cell = False
            for cell in cells:
                cell_clean = cell.strip()
                if not cell_clean:
                    continue
                words = cell_clean.split()
                # A cell with >15 words and sentence-ending punctuation is likely prose
                if len(words) > 15 and re.search(r'[.!?]$', cell_clean):
                    has_prose_cell = True
                    break
                # Check if cell is essentially the caption repeated
                if cap_phrase and len(cap_phrase) > 10 and cap_phrase in cell_clean.lower():
                    has_prose_cell = True
                    break
            if has_prose_cell:
                continue
            cleaned_lines.append(line)
        result = "\n".join(cleaned_lines)
        # If we stripped everything, return original
        pipe_lines = [l for l in result.splitlines() if l.strip().startswith("|")]
        if len(pipe_lines) < 2:
            return md
        return result

    @staticmethod
    def _vision_table_has_labels(md: str, min_cols: int = 2) -> bool:
        """Check if a vision-extracted markdown table has a populated leftmost column
        AND at least min_cols data columns. Returns False for tables with empty first
        cells or suspiciously few columns."""
        if not md or "|" not in md:
            return True
        lines = [ln.strip() for ln in md.splitlines() if ln.strip() and "|" in ln]
        data_lines = []
        for ln in lines:
            cells = [c.strip() for c in ln.strip().strip("|").split("|")]
            if all(re.fullmatch(r":?-{2,}:?", c.replace(" ", "")) for c in cells if c):
                continue
            data_lines.append(cells)
        if len(data_lines) < 3:
            return True
        # Check column count: a real research table has at least 2 data columns
        max_cols = max(len(row) for row in data_lines)
        non_empty_cols = max(sum(1 for c in row if c.strip()) for row in data_lines)
        if non_empty_cols < min_cols:
            return False
        data_rows = data_lines[1:]  # skip header
        empty_first = sum(1 for row in data_rows if not row[0].strip())
        return empty_first < len(data_rows) * 0.5

    @staticmethod
    def _extract_table_with_vision_retry(fitz_page, crop_box, api_key: str) -> str:
        """Retry vision extraction with explicit label-column emphasis and wider crop."""
        try:
            from groq import Groq
            import base64
            import fitz

            client = Groq(api_key=api_key)
            pix = fitz_page.get_pixmap(clip=fitz.Rect(crop_box), dpi=200)
            img_data = pix.tobytes("png")
            b64_img = base64.b64encode(img_data).decode('utf-8')

            prompt = (
                "Extract the table from this research paper image into a GitHub-flavored Markdown table.\n"
                "CRITICAL: The FIRST column contains row labels (model names, method names, or system names). "
                "You MUST include these labels — they are the leftmost text in each data row.\n"
                "Include ALL columns and ALL rows. Preserve exact numeric values.\n"
                "Use LaTeX ($...$) for scientific notation.\n"
                "Output ONLY the markdown table."
            )

            completion = client.chat.completions.create(
                model="meta-llama/llama-4-scout-17b-16e-instruct",
                messages=[{
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64_img}"}}
                    ]
                }],
                temperature=0.0
            )
            return completion.choices[0].message.content.strip()
        except Exception as e:
            logger.debug(f"Vision table retry failed: {e}")
            return ""

    @staticmethod
    def _extract_table_with_vision(fitz_page, crop_box, api_key: str) -> str:
        try:
            from groq import Groq
            import base64
            import fitz
            
            client = Groq(api_key=api_key)
            
            # Crop image
            pix = fitz_page.get_pixmap(clip=fitz.Rect(crop_box), dpi=200)
            img_data = pix.tobytes("png")
            b64_img = base64.b64encode(img_data).decode('utf-8')
            
            prompt = ("Extract this research-paper table into ONE perfect GitHub-flavored Markdown table. "
                      "Include EVERY column, especially the leftmost label/name column (e.g. model names, method names) — do not drop it. "
                      "Preserve all numeric values exactly and keep each value under its correct column header. "
                      "Use LaTeX ($...$) for math like scientific notation. "
                      "Output ONLY the markdown table, no commentary.")
            
            completion = client.chat.completions.create(
                model="meta-llama/llama-4-scout-17b-16e-instruct",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/png;base64,{b64_img}"
                                }
                            }
                        ]
                    }
                ],
                temperature=0.0
            )
            return completion.choices[0].message.content.strip()
        except Exception as e:
            logger.debug(f"Vision table extraction failed: {e}")
            return ""

    @staticmethod
    def extract_table_markdown(plumber_page, fitz_page, config: Dict[str, Any] = None) -> List[Dict[str, Any]]:
        tables = []
        try:
            table_captions = []
            blocks = fitz_page.get_text("blocks")
            for b in blocks:
                if b[6] == 0:
                    text = b[4].strip()
                    if re.match(r'^Table\s+\d+[:\.]', text, re.IGNORECASE) and len(text.split()) < 40:
                        table_captions.append({"text": text.replace('\n', ' '), "bbox": b[:4]})

            if not table_captions:
                return tables

            page_width = fitz_page.rect.width
            page_height = fitz_page.rect.height

            try:
                native_tables = plumber_page.find_tables()
            except Exception:
                native_tables = []

            for cap in table_captions:
                cx0, cy0, cx1, cy1 = cap["bbox"]

                is_left = cx1 < (page_width / 2) + 20
                is_right = cx0 > (page_width / 2) - 20
                spans_full = not is_left and not is_right  # caption spans both columns
                if spans_full or (is_left and is_right):
                    crop_x0, crop_x1 = 0, page_width
                elif is_left:
                    crop_x0, crop_x1 = 0, (page_width / 2)
                else:
                    crop_x0, crop_x1 = (page_width / 2), page_width

                search_box = (crop_x0, cy1, crop_x1, min(page_height, cy1 + 560))

                matched_native = None
                for nt in native_tables:
                    tb = nt.bbox
                    if (
                        tb[0] < search_box[2] and tb[2] > search_box[0] and
                        tb[1] < search_box[3] and tb[3] > search_box[1]
                    ):
                        matched_native = nt
                        break

                md_text = ""
                crop_box = (crop_x0, max(0, cy1 - 2), crop_x1, min(page_height, cy1 + 560))

                if config and config.get("groq_api_key"):
                    vision_md = TableDetector._extract_table_with_vision(fitz_page, crop_box, config.get("groq_api_key"))
                    if vision_md and TableDetector._vision_table_has_labels(vision_md):
                        md_text = vision_md
                    elif vision_md:
                        print(f"[TABLE] Vision rejected (labels/cols check failed), retrying wider crop")
                        wider_box = (0, max(0, cy1 - 2), page_width, min(page_height, cy1 + 560))
                        retry_md = TableDetector._extract_table_with_vision_retry(fitz_page, wider_box, config.get("groq_api_key"))
                        if retry_md and TableDetector._vision_table_has_labels(retry_md):
                            md_text = retry_md
                            crop_box = wider_box
                            print(f"[TABLE] Vision retry succeeded with wider crop")
                        else:
                            print(f"[TABLE] Vision retry also failed — using fallbacks")

                if not md_text and matched_native is not None:
                    try:
                        rows = matched_native.extract()
                        md_body = TableDetector._cells_to_markdown(rows)
                        if md_body:
                            md_text = md_body
                            crop_box = (
                                matched_native.bbox[0],
                                matched_native.bbox[1],
                                matched_native.bbox[2],
                                matched_native.bbox[3],
                            )
                    except Exception as e:
                        logger.debug(f"Native table extraction failed, falling back: {e}")

                # Fast path: PyMuPDF block-based extraction (no pdfplumber overhead)
                if not md_text:
                    try:
                        md_body = TableDetector._fitz_blocks_to_markdown(fitz_page, crop_box)
                        if md_body:
                            md_text = md_body
                    except Exception as ef:
                        logger.debug(f"PyMuPDF fast extraction failed: {ef}")

                # Slow fallback: pdfplumber word extraction (only if fitz failed)
                if not md_text:
                    try:
                        cropped_b = plumber_page.within_bbox(crop_box)
                        words = cropped_b.extract_words(
                            x_tolerance=4,
                            y_tolerance=4,
                            keep_blank_chars=False,
                            use_text_flow=False,
                        )
                        if words:
                            md_body = TableDetector._words_to_markdown(words)
                            if md_body:
                                md_text = md_body
                    except Exception as eb:
                        logger.debug(f"Word-cluster extraction failed: {eb}")

                if not md_text:
                    try:
                        cropped_c = plumber_page.within_bbox(crop_box)
                        raw_text = cropped_c.extract_text(layout=True)
                        if raw_text and len(raw_text.strip()) >= 15:
                            md_text = TableDetector._layout_text_to_markdown(raw_text)
                    except Exception as ec:
                        logger.debug(f"Layout fallback failed: {ec}")

                if not md_text:
                    continue

                # If result has very few columns and crop was half-page, retry full-width
                def _count_md_cols(md: str) -> int:
                    mx = 0
                    for _ln in md.splitlines():
                        if _ln.strip().startswith("|") and "---" not in _ln:
                            cells = [c.strip() for c in _ln.strip().strip("|").split("|") if c.strip()]
                            mx = max(mx, len(cells))
                    return mx

                md_cols = _count_md_cols(md_text)
                is_half_page = (crop_x1 - crop_x0) < page_width * 0.8
                if md_cols <= 1 and is_half_page:
                    full_box = (0, max(0, cy1 - 2), page_width, min(page_height, cy1 + 560))
                    print(f"[TABLE] Single-column ({md_cols} cols), retrying full-width crop")
                    improved = False
                    if config and config.get("groq_api_key"):
                        retry_md = TableDetector._extract_table_with_vision_retry(fitz_page, full_box, config.get("groq_api_key"))
                        if retry_md and _count_md_cols(retry_md) > md_cols:
                            md_text = retry_md
                            crop_box = full_box
                            md_cols = _count_md_cols(md_text)
                            improved = True
                            print(f"[TABLE] Full-width vision got {md_cols} cols")
                    if not improved:
                        try:
                            fw_body = TableDetector._fitz_blocks_to_markdown(fitz_page, full_box)
                            if fw_body and _count_md_cols(fw_body) > md_cols:
                                md_text = fw_body
                                crop_box = full_box
                                print(f"[TABLE] Full-width fitz got {_count_md_cols(fw_body)} cols")
                        except Exception:
                            pass

                # Post-process: remove rows that are prose (sentences bleeding in
                # from outside the table) or that repeat the caption text
                md_text = TableDetector._strip_prose_rows_from_markdown(md_text, cap["text"])

                plain = re.sub(r'[|`\-]+', ' ', md_text)
                plain = re.sub(r'\s+', ' ', plain).strip()

                tables.append({
                    "markdown": md_text,
                    "bbox": crop_box,
                    "caption": cap["text"],
                    "text": plain,
                })

        except Exception as e:
            logger.warning(f"Table extraction failed: {e}")
        return tables


class SectionDetector:
    SECTION_PATTERNS = [
        r'^\d+\.?\s+[A-Z]',
        r'^[IVX]+\.?\s+[A-Z]',
        r'^(Abstract|Introduction|Methods|Results|Discussion|Conclusion|References)',
    ]

    @classmethod
    def detect_section(cls, text: str) -> Optional[str]:
        text = text.strip()
        if len(text) > 100:
            return None
        for p in cls.SECTION_PATTERNS:
            if re.match(p, text, re.IGNORECASE):
                return text
        return None


@dataclass
class ExtractedEquation:
    text: str
    latex: str
    page_num: int
    bbox: Tuple[float, float, float, float]
    global_number: int
    section: str = ""
    equation_type: str = "display"
    confidence: float = 0.95


@dataclass
class ExtractedTable:
    text: str
    markdown: str
    page_num: int
    bbox: Tuple[float, float, float, float]
    global_number: int
    caption: str = ""
    section: str = ""


@dataclass
class ExtractedFigure:
    caption: str
    page_num: int
    bbox: Tuple[float, float, float, float]
    global_number: int
    image_path: Optional[str] = None
    section: str = ""


class PDFProcessorV2:
    def __init__(self, config: Dict[str, Any]):
        self.config = config
        self.eq_det = StrictEquationDetector()
        self.tbl_det = TableDetector()
        self.sec_det = SectionDetector()

    @staticmethod
    def _merge_equation_blocks(blocks: list) -> dict:
        """
        Given a flat list of equation block dicts (or None sentinels),
        group consecutive non-None blocks that are spatially close on the page
        into merge groups.

        Returns: dict mapping block_index → group_id
        """
        group_map = {}
        group_id = 0
        prev_bbox = None
        prev_grp = None
        VERT_GAP = 30

        for i, blk in enumerate(blocks):
            if blk is None:
                prev_bbox = None
                prev_grp = None
                continue

            bbox = blk['bbox']
            if (
                prev_bbox is not None
                and abs(bbox[1] - prev_bbox[3]) < VERT_GAP
                and abs(bbox[0] - prev_bbox[0]) < 120
            ):
                group_map[i] = prev_grp
            else:
                group_map[i] = group_id
                prev_grp = group_id
                group_id += 1

            prev_bbox = bbox

        return group_map

    @staticmethod
    def _dedup_equation_text(text: str) -> str:
        """
        Remove duplicated halves using sliding-prefix strategy.
        Handles all known PyMuPDF duplication patterns.
        """
        import re as _re
        if not text or len(text) < 6:
            return text
        s = _re.sub(r'[\n\r\t]+', ' ', text.strip())
        s = _re.sub(r' {2,}', ' ', s)

        mid = len(s) // 2
        a, b = s[:mid].strip(), s[mid:].strip()
        if len(a) > 4 and (b.startswith(a[:min(8, len(a))]) or a in b):
            return a

        for split_len in range(len(s) // 3, (len(s) * 2) // 3):
            prefix = s[:split_len]
            rest = s[split_len:]
            if len(prefix) > 5 and rest.startswith(prefix[:max(4, len(prefix) - 2)]):
                return prefix

        return s

    @staticmethod
    def _extract_inline_math(page_text: str) -> List[str]:
        """Inline math extraction disabled to avoid leaking fragmented expressions into responses."""
        return []

    @staticmethod
    def _is_equation_support_block(
        text: str,
        bbox: Tuple[float, float, float, float],
        prev_bbox: Tuple[float, float, float, float] = None
    ) -> bool:
        """Treat tiny superscript/summation helper blocks as part of a nearby equation."""
        if not text or not prev_bbox:
            return False
        compact = re.sub(r'\s+', ' ', text).strip()
        if len(compact) > 40:
            return False
        support_patterns = [
            r'^[NXYij\s]+$',
            r'^[∑∏∫]+$',
            r'^i$',
            r'^N$',
            r'^X$',
            r'^Y$',
            r'^pθ\([^)]*\)$',
            r'^pη\([^)]*\)$',
        ]
        if not any(re.match(p, compact) for p in support_patterns):
            return False
        same_band = (
            abs(bbox[1] - prev_bbox[1]) < 22 or
            abs(bbox[1] - prev_bbox[3]) < 22 or
            abs(bbox[3] - prev_bbox[1]) < 22
        )
        close_x = abs(bbox[0] - prev_bbox[0]) < 180 or abs(bbox[0] - prev_bbox[2]) < 120
        return same_band and close_x

    def process_pdf(self, pdf_path: str) -> Dict[str, Any]:
        self.eq_counter, self.tbl_counter, self.fig_counter, self.current_section = 0, 0, 0, ""
        doc = fitz.open(pdf_path)
        plumber_doc = pdfplumber.open(pdf_path)
        equations, tables, figures, page_texts = [], [], [], []
        inline_math_expressions = []

        for page_num in range(len(doc)):
            page = doc[page_num]
            plumber_page = plumber_doc.pages[page_num]

            page_tables = self.tbl_det.extract_table_markdown(plumber_page, page, self.config)
            for pt in page_tables:
                self.tbl_counter += 1
                tbl = ExtractedTable(
                    text=pt["text"],
                    markdown=pt["markdown"],
                    page_num=page_num,
                    bbox=pt["bbox"],
                    global_number=self.tbl_counter,
                    caption=pt.get("caption", ""),
                    section=self.current_section,
                )
                tables.append(tbl)

            blocks = page.get_text("blocks")
            page_text_parts = []
            pending_eq_blocks = []

            for b in blocks:
                x0, y0, x1, y1, text, block_no, block_type = b
                text = text.strip()
                bbox = (x0, y0, x1, y1)

                if not text and block_type == 0:
                    continue

                if block_type == 1:
                    self.fig_counter += 1
                    fig = ExtractedFigure(
                        caption=f"Image from page {page_num + 1}",
                        page_num=page_num,
                        bbox=bbox,
                        global_number=self.fig_counter,
                        image_path=None,
                        section=self.current_section,
                    )
                    figures.append(fig)
                    page_text_parts.append(f"[Figure {self.fig_counter}]")
                    continue

                if block_type == 0:
                    if re.match(r'^\s*(Figure|Fig\.)\s*\d+', text, re.IGNORECASE):
                        self.fig_counter += 1
                        caption = text.replace('\n', ' ')
                        fig = ExtractedFigure(
                            caption=caption,
                            page_num=page_num,
                            bbox=bbox,
                            global_number=self.fig_counter,
                            image_path=None,
                            section=self.current_section,
                        )
                        figures.append(fig)
                        page_text_parts.append(f"[{caption}]")
                        continue

                    section_title = self.sec_det.detect_section(text)
                    if section_title:
                        self.current_section = section_title
                        page_text_parts.append(text)
                        continue

                    if self.eq_det.is_equation(text, bbox):
                        pending_eq_blocks.append({'text': text, 'bbox': bbox})
                        page_text_parts.append(f"__EQ_PENDING_{len(pending_eq_blocks)-1}__")
                        continue

                    prev_eq_bbox = None
                    for prev in reversed(pending_eq_blocks):
                        if isinstance(prev, dict):
                            prev_eq_bbox = prev.get('bbox')
                            break
                        if prev is None:
                            break

                    if self._is_equation_support_block(text, bbox, prev_eq_bbox):
                        pending_eq_blocks.append({'text': text, 'bbox': bbox, 'support': True})
                        page_text_parts.append(f"__EQ_PENDING_{len(pending_eq_blocks)-1}__")
                    else:
                        pending_eq_blocks.append(None)
                        page_text_parts.append(text)

            merged_eq_groups = self._merge_equation_blocks(pending_eq_blocks)

            final_parts = []
            for part in page_text_parts:
                m = re.match(r'__EQ_PENDING_(\d+)__', part)
                if m:
                    blk_idx = int(m.group(1))
                    group_id = merged_eq_groups.get(blk_idx)
                    if group_id is not None:
                        final_parts.append(f"__EQ_GROUP_{group_id}__")
                else:
                    final_parts.append(part)

            seen_groups = set()
            clean_parts = []
            for part in final_parts:
                if part.startswith("__EQ_GROUP_"):
                    if part not in seen_groups:
                        seen_groups.add(part)
                        clean_parts.append(part)
                else:
                    clean_parts.append(part)

            groups: dict = {}
            for blk_idx, grp_id in merged_eq_groups.items():
                blk = pending_eq_blocks[blk_idx]
                if blk is None:
                    continue
                groups.setdefault(grp_id, []).append(blk)

            eq_group_to_number = {}
            for grp_id in sorted(groups.keys()):
                group_blocks = groups[grp_id]
                merged_text = ' '.join(b['text'] for b in group_blocks)
                merged_text = self._dedup_equation_text(merged_text)
                merged_compact = re.sub(r'\s+', ' ', merged_text).strip()
                if re.match(r'^[NXYij\s]+$', merged_compact):
                    continue

                x0 = min(b['bbox'][0] for b in group_blocks)
                y0 = min(b['bbox'][1] for b in group_blocks)
                x1 = max(b['bbox'][2] for b in group_blocks)
                y1 = max(b['bbox'][3] for b in group_blocks)
                merged_bbox = (x0, y0, x1, y1)

                try:
                    from equation_latex import to_latex, looks_like_math
                    if looks_like_math(merged_text, strict=False):
                        latex = to_latex(merged_text)
                    else:
                        latex = self.eq_det.extract_latex_from_text(merged_text)
                except ImportError:
                    latex = self.eq_det.extract_latex_from_text(merged_text)

                self.eq_counter += 1
                eq = ExtractedEquation(
                    text=merged_text,
                    latex=latex,
                    page_num=page_num,
                    bbox=merged_bbox,
                    global_number=self.eq_counter,
                    section=self.current_section,
                    equation_type="display",
                    confidence=0.95,
                )
                equations.append(eq)
                eq_group_to_number[grp_id] = self.eq_counter

            final_page_parts = []
            for part in clean_parts:
                m = re.match(r'__EQ_GROUP_(\d+)__', part)
                if m:
                    grp_id = int(m.group(1))
                    eq_num = eq_group_to_number.get(grp_id, '?')
                    final_page_parts.append(f"[Equation {eq_num}]")
                elif not part.startswith('__EQ'):
                    final_page_parts.append(part)

            final_page_text = "\n\n".join(final_page_parts)
            page_texts.append(final_page_text)

            inline_math_expressions.extend([
                {'page': page_num, 'text': expr, 'equation_type': 'inline'}
                for expr in self._extract_inline_math(final_page_text)
            ])

        num_pages = len(doc)
        doc.close()
        plumber_doc.close()

        return {
            'equations': equations,
            'tables': tables,
            'figures': figures,
            'page_texts': page_texts,
            'num_pages': num_pages,
            'inline_math_expressions': inline_math_expressions,
        }


class EnhancedPDFProcessor:
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self.processor = PDFProcessorV2(self.config)

    # ------------------------------------------------------------------
    # Fast text-first extraction (Phase 3: Chunked Indexing)
    # ------------------------------------------------------------------

    def extract_text_fast(self, pdf_path: str) -> Dict[str, Any]:
        """Stage 1: Extract text layer only using PyMuPDF (sub-second).
        Returns page_texts so the user can start chatting immediately.
        """
        doc = fitz.open(pdf_path)
        page_texts = []
        table_pages: List[int] = []

        for page_num in range(len(doc)):
            page = doc[page_num]
            text = page.get_text("text")
            page_texts.append(text)
            # Heuristic: mark pages that likely contain tables
            if re.search(r'Table\s+\d+[:\.]', text, re.IGNORECASE):
                table_pages.append(page_num)

        num_pages = len(doc)
        doc.close()

        return {
            "page_texts": page_texts,
            "num_pages": num_pages,
            "table_pages": table_pages,
        }

    def extract_assets_targeted(self, pdf_path: str, table_pages: List[int] = None) -> Dict[str, Any]:
        """Stage 2: Extract tables/equations/figures only on relevant pages.
        Saves figure images to disk for VLM processing.
        """
        doc = fitz.open(pdf_path)
        plumber_doc = pdfplumber.open(pdf_path)

        equations, tables, figures = [], [], []
        eq_counter, tbl_counter, fig_counter = 0, 0, 0
        current_section = ""

        # Create figure output directory
        fig_dir = os.path.join(os.path.dirname(pdf_path), "figures")
        os.makedirs(fig_dir, exist_ok=True)

        all_pages = range(len(doc))
        pages_for_tables = set(table_pages) if table_pages else set(all_pages)

        for page_num in all_pages:
            page = doc[page_num]
            plumber_page = plumber_doc.pages[page_num]

            # Table extraction — only on flagged pages
            if page_num in pages_for_tables:
                try:
                    page_tables = self.processor.tbl_det.extract_table_markdown(plumber_page, page, self.config)
                    for pt in page_tables:
                        tbl_counter += 1
                        tables.append(ExtractedTable(
                            text=pt["text"], markdown=pt["markdown"],
                            page_num=page_num, bbox=pt["bbox"],
                            global_number=tbl_counter, caption=pt.get("caption", ""),
                            section=current_section,
                        ))
                except Exception as e:
                    logger.warning("Table extraction failed on page %d: %s", page_num, e)

            # Equations and figures via fast block scan
            blocks = page.get_text("blocks")
            for b in blocks:
                x0, y0, x1, y1, text, block_no, block_type = b
                text = (text or "").strip()
                bbox = (x0, y0, x1, y1)

                # Image block — extract and save to disk
                if block_type == 1:
                    fig_counter += 1
                    image_path = None
                    try:
                        # Rasterize the image region from the page
                        clip = fitz.Rect(x0, y0, x1, y1)
                        mat = fitz.Matrix(2, 2)  # 2x zoom for quality
                        pix = page.get_pixmap(matrix=mat, clip=clip)
                        img_filename = f"fig_{fig_counter}_page{page_num + 1}.png"
                        image_path = os.path.join(fig_dir, img_filename)
                        pix.save(image_path)
                    except Exception as e:
                        logger.debug("Figure image save failed: %s", e)
                        image_path = None

                    figures.append(ExtractedFigure(
                        caption=f"Figure {fig_counter} (Page {page_num + 1})",
                        page_num=page_num, bbox=bbox,
                        global_number=fig_counter, image_path=image_path,
                        section=current_section,
                    ))
                    continue

                if not text:
                    continue

                if re.match(r'^\s*(Figure|Fig\.)\s*\d+', text, re.IGNORECASE):
                    fig_counter += 1
                    # Rasterize the figure region so VECTOR-graphic figures (drawn,
                    # not embedded raster) also get an image for the VLM. Figures sit
                    # above their caption, so render top-of-page → caption bottom.
                    fig_image_path = None
                    try:
                        pw = page.rect.width
                        region = fitz.Rect(0, max(0, y0 - 420), pw, y1 + 5)
                        if region.height < 60:  # caption near top → render full page
                            region = page.rect
                        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=region)
                        img_filename = f"fig_{fig_counter}_page{page_num + 1}.png"
                        fig_image_path = os.path.join(fig_dir, img_filename)
                        pix.save(fig_image_path)
                    except Exception as e:
                        logger.debug("Figure region render failed: %s", e)
                        fig_image_path = None
                    figures.append(ExtractedFigure(
                        caption=text.replace('\n', ' '),
                        page_num=page_num, bbox=bbox,
                        global_number=fig_counter, image_path=fig_image_path,
                        section=current_section,
                    ))
                    continue

                sec = self.processor.sec_det.detect_section(text)
                if sec:
                    current_section = sec
                    continue

                if self.processor.eq_det.is_equation(text, bbox):
                    eq_counter += 1
                    deduped = self.processor._dedup_equation_text(text)
                    latex = self.processor.eq_det.extract_latex_from_text(deduped)
                    eq_obj = ExtractedEquation(
                        text=deduped, latex=latex,
                        page_num=page_num, bbox=bbox,
                        global_number=eq_counter, section=current_section,
                    )
                    # Render a generous region around the equation so the VLM
                    # captures the full expression including fractions/roots above
                    # and subscripts/denominators below the text-block bbox.
                    eq_h = y1 - y0
                    pad_above = max(eq_h * 0.4, 20)
                    pad_below = max(eq_h * 0.5, 30)
                    pad_lr = max((x1 - x0) * 0.15, 15)
                    try:
                        pw, ph = page.rect.width, page.rect.height
                        region = fitz.Rect(
                            max(0, x0 - pad_lr), max(0, y0 - pad_above),
                            min(pw, x1 + pad_lr), min(ph, y1 + pad_below),
                        )
                        pix = page.get_pixmap(matrix=fitz.Matrix(3, 3), clip=region)
                        eq_obj._eq_png = pix.tobytes("png")
                    except Exception:
                        eq_obj._eq_png = None
                    equations.append(eq_obj)

        doc.close()
        plumber_doc.close()

        # Vision pass: replace mangled text-LaTeX with clean VLM LaTeX (parallel)
        api_key = self.config.get("groq_api_key") if isinstance(self.config, dict) else None
        if api_key and equations:
            self._enhance_equations_with_vision(equations, api_key)

        return {"equations": equations, "tables": tables, "figures": figures}

    @staticmethod
    def _validate_latex(tex: str) -> bool:
        """Generic sanity check for extracted LaTeX: balanced delimiters,
        minimum plausible length, no abrupt mid-expression start."""
        if not tex or len(tex) < 5:
            return False
        # Balanced braces
        if tex.count("{") != tex.count("}"):
            return False
        # Balanced parens (soft: allow off-by-one for implicit closing)
        if abs(tex.count("(") - tex.count(")")) > 1:
            return False
        # Starts mid-expression (leading operator with no LHS)
        if re.match(r"^\s*[/\+\*\)\]\}]", tex):
            return False
        # Must contain at least one letter or command (not just operators)
        if not re.search(r"[A-Za-z]", tex):
            return False
        # Looks truncated at the front: starts with a closing paren/bracket/brace
        # or starts with \sqrt, \frac without a clear LHS before it. Heuristic:
        # if the tex has NO = sign and starts immediately with a \command that
        # is typically the RHS of an equation, it's likely missing its left side.
        stripped = tex.strip()
        if "=" not in stripped:
            # Expressions that begin with operators or right-side commands
            # without any LHS are likely truncated
            if re.match(r"^\s*\\?(sqrt|frac|cdot|times|div)\b", stripped):
                return False
        return True

    @staticmethod
    def _enhance_equations_with_vision(equations, api_key, model="meta-llama/llama-4-scout-17b-16e-instruct"):
        """Use the vision model to extract clean LaTeX for each equation image, in parallel.
        Only replaces text-extracted LaTeX if the vision result passes validation."""
        import base64, time
        from concurrent.futures import ThreadPoolExecutor
        try:
            from groq import Groq
        except Exception:
            return
        client = Groq(api_key=api_key)
        prompt = ("Transcribe the single mathematical equation in this image into clean LaTeX. "
                  "Output ONLY the LaTeX body (no $ delimiters, no prose, no equation number). "
                  "Use ^ for superscripts, _ for subscripts, \\frac for fractions, \\sqrt, "
                  "\\text{} for operator names.")

        def _one(eq):
            png = getattr(eq, "_eq_png", None)
            if not png:
                return
            try:
                b64 = base64.b64encode(png).decode()
                r = client.chat.completions.create(model=model, temperature=0.0, max_tokens=220,
                    messages=[{"role": "user", "content": [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}}]}])
                tex = (r.choices[0].message.content or "").strip()
                tex = re.sub(r"^\$+|\$+$", "", tex).strip()
                tex = re.sub(r"^```(?:latex)?|```$", "", tex).strip()
                if not EnhancedPDFProcessor._validate_latex(tex):
                    print(f"[EQ-VALIDATE] Eq {eq.global_number}: VLM result failed validation, keeping text-extracted")
                    return
                # Only replace if vision result is at least as long as existing
                # (prevents overwriting a complete expression with a truncated one)
                old = (eq.latex or "").strip()
                if old and len(tex) < len(old) * 0.5 and EnhancedPDFProcessor._validate_latex(old):
                    print(f"[EQ-VALIDATE] Eq {eq.global_number}: VLM result shorter than text-extracted, keeping original")
                    return
                eq.latex = tex
            except Exception as e:
                logger.debug("Equation vision LaTeX failed (eq %s): %s", eq.global_number, e)

        t0 = time.perf_counter()
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(_one, equations))
        print(f"[TIMING] Equation vision LaTeX: {time.perf_counter()-t0:.1f}s for {len(equations)} equations")

    # ------------------------------------------------------------------
    # Full processing (original path — used by background indexer)
    # ------------------------------------------------------------------

    def process_pdf(self, pdf_path: str) -> ProcessedDocument:
        raw = self.processor.process_pdf(pdf_path)

        equations = [
            ProcessedEquation(
                equation_id=f"eq_{uuid.uuid4().hex[:8]}",
                global_number=e.global_number,
                text=e.text,
                latex=e.latex,
                page_number=e.page_num,
                bbox=e.bbox,
                section=e.section,
                confidence=getattr(e, 'confidence', 0.95),
                raw_text=e.text,
                equation_type=getattr(e, 'equation_type', 'display'),
                normalized_latex=e.latex,
            )
            for e in raw.get('equations', [])
        ]

        tables = [
            ProcessedTable(
                table_id=f"tb_{uuid.uuid4().hex[:8]}",
                global_number=t.global_number,
                page_number=t.page_num,
                bbox=t.bbox,
                markdown=t.markdown,
                raw_text=t.text,
                caption=t.caption,
                section=t.section,
                description=t.caption,
            )
            for t in raw.get('tables', [])
        ]

        figures = [
            ProcessedFigure(
                figure_id=f"fig_{uuid.uuid4().hex[:8]}",
                global_number=f.global_number,
                page_number=f.page_num,
                bbox=f.bbox,
                image_path=f.image_path or "",
                caption=f.caption,
                raw_text=f.caption,
                description=f.caption,
                section=f.section,
            )
            for f in raw.get('figures', [])
        ]

        return ProcessedDocument(
            doc_id=f"doc_{uuid.uuid4().hex[:8]}",
            filename=os.path.basename(pdf_path),
            num_pages=raw.get('num_pages', 0),
            page_texts=raw.get('page_texts', []),
            enriched_page_texts=raw.get('page_texts', []),
            sections=[],
            equations=equations,
            tables=tables,
            figures=figures,
            title=os.path.basename(pdf_path),
            metadata={
                'display_equation_count': len(equations),
                'inline_math_count': len(raw.get('inline_math_expressions', [])),
                'inline_math_expressions': raw.get('inline_math_expressions', []),
            },
        )
