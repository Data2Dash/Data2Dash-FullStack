/**
 * mathUtils.ts
 * Post-processes LLM text to ensure math expressions are wrapped in LaTeX
 * delimiters so KaTeX renders them properly.
 *
 * Strategy
 * --------
 * 1. Strip [Equation N | Page N] citation tags produced by the PDF agent and
 *    replace them with cleaner inline references like *(Eq. N, p. N)*.
 * 2. Already-wrapped expressions ($$...$$ or $...$) are left untouched.
 * 3. Lines containing raw LaTeX commands (\frac, \text, \sqrt, etc.) that
 *    are NOT already wrapped get auto-wrapped in $$ display blocks.
 * 4. Common "plain English" math patterns (e^x, x_i) become inline $...$.
 */

// ── Citation tag cleaner ─────────────────────────────────────────────────────
// Matches patterns like [Equation 2 | Page 10] or [Eq. 3 | Page 5]
const EQ_CITATION_RE = /\[(?:Equation|Eq\.?)\s*(\d+)\s*\|\s*Page\s*(\d+)\]\s*/gi;

/**
 * Remove PDF-agent-style equation citation tags and convert to clean labels.
 * "[Equation 2 | Page 10]" → "*(Eq. 2, p. 10)* "
 */
function cleanCitationTags(text: string): string {
  return text.replace(EQ_CITATION_RE, (_match, eqNum, pageNum) => {
    return ` *(Eq. ${eqNum}, p. ${pageNum})* `;
  });
}

// ── Tilde/hat notation cleaner ───────────────────────────────────────────────
// Handles common PDF extraction artifacts for LaTeX diacritics:
// ˜A → \tilde{A}, ˆA → \hat{A}
function fixDiacriticNotation(text: string): string {
  // ˜X or ~X followed by letter → $\tilde{X}$ (outside math blocks)
  // ˆX → $\hat{X}$
  return text
    .replace(/(?<!\$)˜([A-Za-z])/g, (_m, c) => `$\\tilde{${c}}$`)
    .replace(/(?<!\$)ˆ([A-Za-z])/g, (_m, c) => `$\\hat{${c}}$`);
}

// ── LaTeX command detection ─────────────────────────────────────────────────
const LATEX_COMMANDS = [
  '\\\\frac', '\\\\dfrac', '\\\\tfrac',
  '\\\\text', '\\\\mathrm', '\\\\mathbf', '\\\\mathcal', '\\\\mathbb',
  '\\\\sqrt', '\\\\sum', '\\\\prod', '\\\\int',
  '\\\\left', '\\\\right',
  '\\\\begin', '\\\\end',
  '\\\\alpha', '\\\\beta', '\\\\gamma', '\\\\delta', '\\\\epsilon',
  '\\\\theta', '\\\\lambda', '\\\\mu', '\\\\sigma', '\\\\omega',
  '\\\\partial', '\\\\nabla', '\\\\infty',
  '\\\\cdot', '\\\\times', '\\\\leq', '\\\\geq', '\\\\neq', '\\\\approx',
  '\\\\in', '\\\\subset', '\\\\forall', '\\\\exists',
  '\\\\log', '\\\\exp', '\\\\max', '\\\\min', '\\\\arg',
  '\\\\hat', '\\\\bar', '\\\\tilde', '\\\\vec',
  '\\\\mid', '\\\\lVert', '\\\\rVert',
  '\\\\overline', '\\\\underline',
  '\\\\oplus', '\\\\otimes', '\\\\odot',
  '\\\\mathcal', '\\\\mathbb', '\\\\boldsymbol',
  '\\\\sigma', '\\\\relu', '\\\\softmax',
];

const LATEX_CMD_RE = new RegExp(
  LATEX_COMMANDS.map(c => c.replace(/\\\\/g, '\\\\')).join('|')
);

/**
 * Returns true if the position `idx` inside `text` is already inside a
 * LaTeX delimiter ($...$ or $$...$$).
 */
function insideMathDelimiter(text: string, idx: number): boolean {
  let dollars = 0;
  for (let i = 0; i < idx; i++) {
    if (text[i] === '$' && (i === 0 || text[i - 1] !== '\\')) dollars++;
  }
  return dollars % 2 !== 0;
}

/**
 * Wrap a line containing raw LaTeX in display math delimiters.
 */
function wrapRawLatexLines(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inMathBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Track $$ blocks to avoid double-wrapping
    if (trimmed === '$$') {
      inMathBlock = !inMathBlock;
      result.push(line);
      continue;
    }

    if (inMathBlock) {
      result.push(line);
      continue;
    }

    // Skip lines already wrapped in $ ... $
    if (/^\$[^$].*[^$]\$$/.test(trimmed) || /^\$\$/.test(trimmed)) {
      result.push(line);
      continue;
    }

    // Check if the line contains raw LaTeX commands
    if (LATEX_CMD_RE.test(trimmed) && !insideMathDelimiter(text, text.indexOf(trimmed))) {
      const isStandalone = (
        /^\\/.test(trimmed) ||
        /^[A-Za-z_{}()\s,]+\s*=\s*\\/.test(trimmed) ||
        trimmed.split(/\s+/).filter(w => /^[a-z]{4,}$/i.test(w)).length < 3
      );

      if (isStandalone) {
        result.push('$$');
        result.push(trimmed);
        result.push('$$');
      } else {
        result.push(wrapInlineLatexFragments(line));
      }
    } else {
      result.push(line);
    }
  }

  return result.join('\n');
}

/**
 * For a line with mixed prose and LaTeX, wrap only the LaTeX fragments inline.
 */
function wrapInlineLatexFragments(line: string): string {
  return line.replace(
    /(\\(?:frac|dfrac|tfrac|text|mathrm|sqrt|sum|prod|int|left|right|begin|end|hat|bar|vec|tilde|overline|log|exp|max|min|arg|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|sigma|omega|partial|nabla|infty|cdot|times|mid|mathbf|mathcal|mathbb|leq|geq|neq|approx|in|forall|exists|oplus|otimes|boldsymbol)[^a-zA-Z](?:[^$\n]*?[})\]>])?)/g,
    (match) => `$${match}$`
  );
}

/** Inline patterns — turn plain `e^{-z}` or `x^2` into $e^{-z}$ */
const INLINE_PATTERNS: { re: RegExp; latex: (m: RegExpMatchArray) => string }[] = [
  // e^{-z} or e^z (only outside already-wrapped $...$)
  {
    re: /(?<!\$)\be\^(\{[^}]+\}|-?\w+)(?!\$)/g,
    latex: (m) => `e^{${m[1].replace(/^\{|\}$/g, '')}}`,
  },
  // x_i subscripts
  {
    re: /(?<!\$)\b([a-zA-Z])_([a-zA-Z0-9]+)(?!\$)/g,
    latex: (m) => `${m[1]}_{${m[2]}}`,
  },
];

/**
 * Main entry point.
 * Run on every AI message string before passing to ReactMarkdown.
 */
export function normalizeEquations(text: string): string {
  // Step 0: Clean up [Equation N | Page N] citation tags from PDF agent
  let out = cleanCitationTags(text);

  // Step 0b: Fix PDF extraction artifacts for tilde/hat notation
  out = fixDiacriticNotation(out);

  // Step 1: Wrap lines with raw LaTeX commands in $$ delimiters
  out = wrapRawLatexLines(out);

  // Step 2: Wrap inline patterns (only outside existing $ blocks)
  for (const { re, latex } of INLINE_PATTERNS) {
    out = out.replace(re, (full, ...args) => {
      const idx = out.indexOf(full);
      if (insideMathDelimiter(out, idx)) return full;
      const m = [full, ...args] as RegExpMatchArray;
      return `$${latex(m)}$`;
    });
  }

  return out;
}
