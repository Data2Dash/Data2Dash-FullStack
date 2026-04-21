/**
 * tableUtils.ts
 * Cleans and expands malformed markdown tables produced by PDF extractors.
 *
 * Common extractor problem:
 *   Instead of one row per data record, the extractor packs all values into
 *   a single body row — one cell per column:
 *
 *     | Smell       | p (files)           | p (KLOC)            |
 *     | ---         | ---                 | ---                 |
 *     | ListComp AssignMulti ... | 0.575 0.03 0.0019 ... | 0.827 6.24e-12 ... |
 *
 *   This util detects such rows and expands them back to N proper rows.
 */

/** Returns true if token looks like a number (incl. scientific notation) */
function isNumericToken(s: string): boolean {
  return /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(s.trim());
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

    // Split each cell into whitespace tokens
    const tokenGroups = cells.map((c) => c.split(/\s+/).filter(Boolean));

    // Count how many tokens in each cell are numeric
    const numericCounts = tokenGroups.map(
      (tokens) => tokens.filter(isNumericToken).length
    );
    const maxNumeric = Math.max(...numericCounts);

    if (maxNumeric <= 1) {
      // Single-value cells — no expansion needed
      expanded.push(line);
      continue;
    }

    // N = number of rows to expand into (driven by the most-numeric cell)
    const N = maxNumeric;

    // Build a value array of length N for each column
    const valueArrays = tokenGroups.map((tokens, ci) => {
      if (numericCounts[ci] >= N) {
        // Take only the numeric tokens (they are the data values)
        return tokens.filter(isNumericToken);
      }
      // Non-numeric column (e.g. smell-type names)
      if (tokens.length >= N) {
        return tokens.slice(0, N); // one token per new row
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
