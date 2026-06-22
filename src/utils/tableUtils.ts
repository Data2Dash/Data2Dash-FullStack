/**
 * tableUtils.ts
 * Cleans and normalises markdown tables produced by PDF extractors.
 *
 * Key fixes:
 * - Preserves "value ± std" as a single cell (never splits on ±)
 * - Expands packed single-row tables back into proper multi-row tables
 * - Normalises separator lines
 */

/** Returns true if token looks like a number (incl. scientific notation) */
function isNumericToken(s: string): boolean {
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s.trim());
}

/**
 * Split a cell's text into logical value tokens, keeping "value ± std" together.
 * E.g. "73.2 ± 1.1 89.4 ± 0.3" → ["73.2 ± 1.1", "89.4 ± 0.3"]
 *      "ListComp AssignMulti" → ["ListComp", "AssignMulti"]
 */
function tokenizeCell(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // First try to split by ± groups: "73.2 ± 1.1" stays together
  const pmPattern = /([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*[±]\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g;
  const pmMatches = [...trimmed.matchAll(pmPattern)];

  if (pmMatches.length > 0) {
    // This cell contains ± values — extract them as grouped tokens
    const tokens: string[] = [];
    let lastEnd = 0;
    for (const m of pmMatches) {
      // Any text before this match → split by whitespace
      const before = trimmed.slice(lastEnd, m.index).trim();
      if (before) tokens.push(...before.split(/\s+/).filter(Boolean));
      tokens.push(m[0]); // the full "value ± std" group
      lastEnd = (m.index ?? 0) + m[0].length;
    }
    const after = trimmed.slice(lastEnd).trim();
    if (after) tokens.push(...after.split(/\s+/).filter(Boolean));
    return tokens;
  }

  // No ± present — simple whitespace split
  return trimmed.split(/\s+/).filter(Boolean);
}

/** Returns true if token is a numeric value or a "value ± std" group */
function isDataToken(s: string): boolean {
  if (isNumericToken(s)) return true;
  return /^[+-]?(\d+\.?\d*|\.\d+)\s*[±]\s*[+-]?(\d+\.?\d*|\.\d+)/.test(s.trim());
}

/** Split a raw table line into trimmed cell strings */
function parseRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/** Returns true for separator lines like  |---|---|---| */
function isSepLine(line: string): boolean {
  const t = line.trim();
  return t.startsWith('|') && t.endsWith('|') && t.includes('-') && /^\|[\s\-:|]+\|$/.test(t);
}

/**
 * Expand a buffer of raw table lines where body rows may have multiple
 * values packed into single cells.
 */
function expandTable(lines: string[]): string[] {
  const sepIdx = lines.findIndex(isSepLine);
  if (sepIdx < 1) return lines; // need at least header + separator

  const headerLine = lines[0];
  const headers = parseRow(headerLine);
  const ncols = headers.length;
  const bodyLines = lines.slice(sepIdx + 1).filter((l) => l.trim() && !isSepLine(l));

  const expanded: string[] = [];

  for (const line of bodyLines) {
    const cells = parseRow(line);
    if (cells.length !== ncols) {
      expanded.push(line);
      continue;
    }

    // Tokenize each cell, preserving ± groups
    const tokenGroups = cells.map(tokenizeCell);

    // Count how many tokens in each cell are data values
    const dataCounts = tokenGroups.map(
      (tokens) => tokens.filter(isDataToken).length
    );
    const maxData = Math.max(...dataCounts);

    if (maxData <= 1) {
      // Single-value cells — no expansion needed
      expanded.push(line);
      continue;
    }

    // N = number of rows to expand into (driven by the cell with most data values)
    const N = maxData;

    // Build a value array of length N for each column
    const valueArrays = tokenGroups.map((tokens, ci) => {
      if (dataCounts[ci] >= N) {
        return tokens.filter(isDataToken);
      }
      // Non-data column (e.g. label names)
      if (tokens.length >= N) {
        return tokens.slice(0, N);
      }
      // Fewer tokens than rows → repeat the whole cell content
      return Array<string>(N).fill(tokens.join(' '));
    });

    // Emit N proper rows
    for (let i = 0; i < N; i++) {
      const rowCells = valueArrays.map((arr) => arr[i] ?? '');
      expanded.push('| ' + rowCells.join(' | ') + ' |');
    }
  }

  // Rebuild with a clean, normalised separator
  const sep = '| ' + Array(ncols).fill('---').join(' | ') + ' |';
  return [headerLine, sep, ...expanded];
}

/**
 * Main entry point.
 * Walks through arbitrary markdown, finds table blocks, and expands them.
 */
export function cleanTableMarkdown(md: string): string {
  const lines = md.split('\n');
  const result: string[] = [];
  let tableBuffer: string[] = [];

  const flushTable = () => {
    if (tableBuffer.length > 0) {
      result.push(...expandTable(tableBuffer));
      tableBuffer = [];
    }
  };

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith('|') && t.endsWith('|')) {
      tableBuffer.push(line);
    } else {
      flushTable();
      result.push(line);
    }
  }
  flushTable();

  return result.join('\n');
}
