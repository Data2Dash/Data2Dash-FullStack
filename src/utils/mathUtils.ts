/**
 * mathUtils.ts
 * Post-processes LLM text to ensure math expressions are wrapped in LaTeX
 * delimiters so KaTeX renders them properly.
 *
 * Strategy
 * --------
 * 1. Already-wrapped expressions ($$...$$ or $...$) are left untouched.
 * 2. Lines containing raw LaTeX commands (\frac, \text, \sqrt, etc.) that
 *    are NOT already wrapped get auto-wrapped in $$ display blocks.
 * 3. Common "plain English" math patterns (e^x, x_i) become inline $...$.
 */

// ── LaTeX command detection ─────────────────────────────────────────────────
// These LaTeX commands are a strong signal the text is math and needs wrapping.
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
];

// Build a single regex that matches any of the latex commands
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
 * Handles lines like:
 *   \text{Attention}(Q, K, V) = \text{softmax}\left(\frac{QK^T}{\sqrt{d_k}}\right)V
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
      // Determine if this is a standalone equation line (display math)
      // or embedded in prose (inline math)
      const isStandalone = (
        // Line is mostly math (starts with a command or = sign pattern)
        /^\\/.test(trimmed) ||
        // Line is an equation like: something = \frac{...}
        /^[A-Za-z_{}()\s,]+\s*=\s*\\/.test(trimmed) ||
        // Line is very short or has no prose words (likely a formula)
        trimmed.split(/\s+/).filter(w => /^[a-z]{4,}$/i.test(w)).length < 3
      );

      if (isStandalone) {
        result.push('$$');
        result.push(trimmed);
        result.push('$$');
      } else {
        // Inline: wrap just the LaTeX fragments within the line
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
 * e.g. "The loss function is \frac{1}{n}\sum x_i which..." →
 *      "The loss function is $\frac{1}{n}\sum x_i$ which..."
 */
function wrapInlineLatexFragments(line: string): string {
  // Match sequences starting with a backslash command and continuing with
  // LaTeX-like characters (braces, carets, underscores, parens, etc.)
  return line.replace(
    /(\\(?:frac|dfrac|tfrac|text|mathrm|sqrt|sum|prod|int|left|right|begin|end|hat|bar|vec|tilde|overline|log|exp|max|min|arg|alpha|beta|gamma|delta|epsilon|theta|lambda|mu|sigma|omega|partial|nabla|infty|cdot|times|mid|mathbf|mathcal|mathbb|leq|geq|neq|approx|in|forall|exists)[^a-zA-Z](?:[^$\n]*?[})\]>])?)/g,
    (match) => `$${match}$`
  );
}


/** Inline patterns — turn plain `e^{-z}` or `x^2` into $e^{-z}$ */
const INLINE_PATTERNS: { re: RegExp; latex: (m: RegExpMatchArray) => string }[] = [
  // e^{-z} or e^z  (only outside already-wrapped $...$)
  {
    re: /(?<!\$)\be\^(\{[^}]+\}|-?\w+)(?!\$)/g,
    latex: (m) => `e^{${m[1].replace(/^\{|\}$/g, '')}}`,
  },
  // x_i  (subscripts)
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
  // Step 1: Wrap lines with raw LaTeX commands in $$ delimiters
  let out = wrapRawLatexLines(text);

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
