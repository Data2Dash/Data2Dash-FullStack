/**
 * CodeBlock.tsx
 * Shared syntax-highlighted code block used inside ReactMarkdown `components`.
 *
 * Rendering rules
 * ───────────────
 * inline=true          → emerald monospace pill (existing behaviour)
 * fenced, multi-line   → full VS Code dark panel with language label + copy
 * fenced, single-line  → compact dark pill (avoids giant blocks for tiny snippets)
 */
import React, { useState } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Check, Copy } from 'lucide-react';

interface CodeProps {
  inline?: boolean;
  className?: string;
  children?: React.ReactNode;
}

function CodeBlock({ inline, className, children }: CodeProps) {
  const [copied, setCopied] = useState(false);

  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const code = String(children ?? '').replace(/\n$/, '');
  const isMultiLine = code.includes('\n') || code.length > 80;

  // ── Inline code  `like this` ──────────────────────────────────────────────
  if (inline) {
    return (
      <code className="px-1.5 py-0.5 rounded-md bg-stone-800 text-emerald-300 font-mono text-[0.82em] font-medium">
        {children}
      </code>
    );
  }

  // ── Single-line fenced block  ```just one line``` ─────────────────────────
  // Render as a compact pill so random keyword fragments don't become panels.
  if (!isMultiLine) {
    return (
      <code className="inline-block my-1 px-3 py-1 rounded-lg bg-stone-800 text-emerald-300 font-mono text-[0.82em] font-medium border border-stone-700">
        {code}
      </code>
    );
  }

  // ── Multi-line fenced block ───────────────────────────────────────────────
  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="my-3 rounded-xl overflow-hidden border border-stone-700 shadow-md">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-stone-800 border-b border-stone-700">
        <span className="text-[11px] font-mono font-semibold text-stone-400 uppercase tracking-widest">
          {language || 'code'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 text-[11px] text-stone-400 hover:text-white transition-colors"
          title="Copy code"
        >
          {copied ? (
            <><Check className="h-3.5 w-3.5 text-emerald-400" /><span className="text-emerald-400">Copied</span></>
          ) : (
            <><Copy className="h-3.5 w-3.5" /><span>Copy</span></>
          )}
        </button>
      </div>

      {/* Code body */}
      <SyntaxHighlighter
        language={language || 'text'}
        style={vscDarkPlus}
        showLineNumbers={code.split('\n').length > 3}
        wrapLines
        customStyle={{
          margin: 0,
          borderRadius: 0,
          fontSize: '0.8rem',
          lineHeight: '1.6',
          padding: '1rem',
          background: '#1e1e1e',
        }}
        lineNumberStyle={{
          minWidth: '2.5em',
          paddingRight: '1em',
          color: '#555',
          userSelect: 'none',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

/** Drop-in `components` prop for ReactMarkdown */
export const codeComponents = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  code: (props: any) => <CodeBlock {...props} />,
};
