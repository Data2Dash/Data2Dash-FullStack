// ─── Citation API ─────────────────────────────────────────────────────────────

export interface CitationPaper {
  id: string;
  title: string;
  authors: string[];
  year: string;
  url: string;
  doi: string;
  // Extended fields
  journal?: string;
  conference?: string;
  abstract?: string;
  relevanceScore?: number; // 0–100
  citationCount?: number;
}

/**
 * The refactored citation pipeline returns each style as a structured object
 * ({ citation, reference, warnings, source_type }) rather than a plain string.
 * A style value may therefore be a legacy string OR this structured entry.
 */
export interface CitationStyleEntry {
  citation?: string;
  reference?: string;
  warnings?: string[];
  source_type?: string;
}

export type CitationStyleValue = string | CitationStyleEntry | null | undefined;

/** Raw shape as it may arrive from the backend (strings or structured entries). */
export interface RawCitationFormatResponse {
  apa: CitationStyleValue;
  mla: CitationStyleValue;
  chicago: CitationStyleValue;
  ieee: CitationStyleValue;
  harvard: CitationStyleValue;
  bibtex: CitationStyleValue;
  source?: CitationStyleValue;
  warnings?: string[];
  source_type?: string;
}

/** Normalized shape the rest of the app consumes — every style is a plain string. */
export interface CitationFormatResponse {
  apa: string;
  mla: string;
  chicago: string;
  ieee: string;
  harvard: string;
  bibtex: string;
  source: string;
}

export type CitationStyle = 'apa' | 'mla' | 'chicago' | 'ieee' | 'harvard' | 'bibtex';

/**
 * Coerce any citation style value into a displayable string. Handles plain
 * strings, the new { citation, reference } objects, and malformed/empty input
 * so a structured object can never reach React as a child.
 */
export function citationToText(value: CitationStyleValue): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    // Prefer the full formatted reference for a bibliography; fall back sensibly.
    const candidate = value.reference ?? value.citation;
    if (typeof candidate === 'string') return candidate;
    // Last-resort: first string field on the object.
    const firstString = Object.values(value).find(v => typeof v === 'string');
    return typeof firstString === 'string' ? firstString : '';
  }
  return String(value);
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_BASE_URL = `${API_URL}/api/citation`;

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchCitations(sentence: string): Promise<CitationPaper[]> {
  const response = await fetch(`${API_BASE_URL}/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sentence }),
  });
  if (!response.ok) throw new Error('Failed to search citations');
  const data = await response.json();
  return data.papers || [];
}

// ─── Format ───────────────────────────────────────────────────────────────────

export async function formatCitation(paper: CitationPaper): Promise<CitationFormatResponse> {
  const response = await fetch(`${API_BASE_URL}/format`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: paper.title,
      authors: paper.authors,
      year: paper.year,
      url: paper.url,
      doi: paper.doi,
      journal: paper.journal,
      conference: paper.conference,
    }),
  });
  if (!response.ok) throw new Error('Failed to format citation');
  const raw: RawCitationFormatResponse = await response.json();
  // Normalize the new structured contract down to flat strings so component
  // state, persistence, rendering, and export all stay string-based.
  return {
    apa: citationToText(raw.apa),
    mla: citationToText(raw.mla),
    chicago: citationToText(raw.chicago),
    ieee: citationToText(raw.ieee),
    harvard: citationToText(raw.harvard),
    bibtex: citationToText(raw.bibtex),
    source: citationToText(raw.source),
  };
}

// ─── Import by DOI / URL / Title ─────────────────────────────────────────────

export async function importCitation(params: {
  doi?: string;
  url?: string;
  title?: string;
}): Promise<CitationPaper> {
  const response = await fetch(`${API_BASE_URL}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!response.ok) throw new Error('Failed to import citation');
  const data = await response.json();
  return data.paper;
}

// ─── Duplicate Detection ──────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

function titleSimilarity(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const na = norm(a), nb = norm(b);
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}

/** Returns true if the paper is already in the list (by DOI, title similarity ≥ 90%, or author+year fingerprint) */
export function isDuplicate(paper: CitationPaper, existing: CitationPaper[]): boolean {
  for (const ex of existing) {
    // 1. Exact DOI match
    if (paper.doi && ex.doi && paper.doi === ex.doi) return true;
    // 2. Title similarity ≥ 90%
    if (paper.title && ex.title && titleSimilarity(paper.title, ex.title) >= 0.9) return true;
    // 3. Author + year fingerprint
    const aFirst = paper.authors?.[0]?.split(' ').pop() ?? '';
    const bFirst = ex.authors?.[0]?.split(' ').pop() ?? '';
    if (aFirst && bFirst && aFirst === bFirst && paper.year === ex.year) return true;
  }
  return false;
}
