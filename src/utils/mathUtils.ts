/**
 * mathUtils.ts
 * Post-processes LLM text to ensure math expressions are wrapped in LaTeX
 * delimiters so KaTeX renders them properly.
 *
 * Strategy
 * --------
 * 1. Already-wrapped expressions ($$...$$ or $...$) are left untouched.
 * 2. Common "plain English" math patterns (fractions, exponents, sums, etc.)
 *    are detected and rewritten as LaTeX display or inline blocks.
 * 3. Named equations explicitly cited by the model are promoted to display blocks.
 */

/** Patterns that, when found in plain text, should become $$ display blocks */
const DISPLAY_PATTERNS: { re: RegExp; latex: (m: RegExpMatchArray) => string }[] = [
  // P(T=1|X) = 1/(1+exp(-z))  → propensity score type
  {
    re: /P\(T\s*=\s*1\s*\|\s*X\s*\)\s*=\s*1\s*\/\s*\(1\s*\+\s*exp\((-[^)]+)\)\)/gi,
    latex: (m) => `P(T=1 \\mid X) = \\dfrac{1}{1 + e^{${m[1]}}}`,
  },
  // Generic form: something = 1/(1 + exp(z)) or e^{-z}
  {
    re: /(\w[\w()\s]*?)\s*=\s*1\s*\/\s*\(\s*1\s*\+\s*e(?:xp)?\(([^)]+)\)\s*\)/gi,
    latex: (m) => `${m[1]} = \\dfrac{1}{1 + e^{${m[2]}}}`,
  },
  // sum_{i=1}^{n}  /  Σ notation
  {
    re: /[Σ∑]\s*_?\{?([^}]+)\}?\s*\^?\{?([^}]+)\}?\s*([\w\s+\-*/^()]+)/g,
    latex: (m) => `\\sum_{${m[1]}}^{${m[2]}} ${m[3]}`,
  },
  // integral ∫_a^b f(x) dx
  {
    re: /∫\s*_?([^\s^]+)\s*\^([^\s]+)\s*([\w\s()+\-*/^]+)\s*d([a-z])/g,
    latex: (m) => `\\int_{${m[1]}}^{${m[2]}} ${m[3]} \\, d${m[4]}`,
  },
];

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
 * Returns true if the position `idx` inside `text` is already inside a
 * LaTeX delimiter ($...$ or $$...$$).
 */
function insideMathDelimiter(text: string, idx: number): boolean {
  // Count unescaped $ chars before this position
  let dollars = 0;
  for (let i = 0; i < idx; i++) {
    if (text[i] === '$' && (i === 0 || text[i - 1] !== '\\')) dollars++;
  }
  return dollars % 2 !== 0;
}

/**
 * Main entry point.
 * Run on every AI message string before passing to ReactMarkdown.
 */
export function normalizeEquations(text: string): string {
  // Step 1: Expand display patterns if not already wrapped
  let out = text;

  for (const { re, latex } of DISPLAY_PATTERNS) {
    out = out.replace(re, (full, ...args) => {
      const idx = out.indexOf(full);
      if (insideMathDelimiter(out, idx)) return full; // already inside $
      const m = [full, ...args] as RegExpMatchArray;
      return `\n$$\n${latex(m)}\n$$\n`;
    });
  }

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
