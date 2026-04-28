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
import { clsx } from 'clsx';

interface CodeProps {
  className?: string;
  children?: React.ReactNode;
}

function CodeBlock({ className, children }: CodeProps) {
  const [copied, setCopied] = useState(false);

  const match = /language-(\w+)/.exec(className || '');
  const isInline = !match;
  const language = match ? match[1] : '';
  const code = String(children ?? '').replace(/\n$/, '');

  // ── Inline code  `like this` ──────────────────────────────────────────────
  if (isInline) {
    return (
      <code className="px-1.5 py-0.5 mx-0.5 rounded-md bg-stone-100 text-stone-800 border border-stone-200 font-mono text-[0.85em] font-semibold break-words">
        {children}
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
    <div className="my-4 rounded-xl overflow-hidden border border-stone-700 shadow-lg bg-[#1e1e1e]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-stone-800/80 border-b border-stone-700">
        <span className="text-[11px] font-mono font-bold text-stone-300 uppercase tracking-widest">
          {language || 'text'}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium text-stone-300 hover:text-white hover:bg-stone-700 transition-colors"
          title="Copy code"
        >
          {copied ? (
            <><Check className="h-3.5 w-3.5 text-emerald-400" /><span className="text-emerald-400">Copied</span></>
          ) : (
            <><Copy className="h-3.5 w-3.5" /><span>Copy code</span></>
          )}
        </button>
      </div>

      {/* Code body */}
      <div className="overflow-x-auto text-[13px] sm:text-sm custom-scrollbar">
        <SyntaxHighlighter
          language={language || 'text'}
          style={vscDarkPlus}
          showLineNumbers={code.split('\n').length > 1}
          customStyle={{
            margin: 0,
            padding: '1rem',
            background: 'transparent',
            minWidth: '100%',
          }}
          lineNumberStyle={{
            minWidth: '2.5em',
            paddingRight: '1em',
            color: '#6e7681',
            userSelect: 'none',
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

/** Drop-in `components` prop for ReactMarkdown */
export const codeComponents = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  code: (props: any) => <CodeBlock {...props} />,
  // Enhanced Blockquote
  blockquote: (props: any) => (
    <blockquote className="border-l-4 border-stone-300 pl-4 py-1 my-4 bg-stone-50/80 rounded-r-lg italic text-stone-600" {...props} />
  ),
  // Enhanced Table Wrapper for responsiveness
  table: (props: any) => (
    <div className="overflow-x-auto w-full my-4 rounded-xl border border-stone-200 shadow-sm custom-scrollbar bg-white">
      <table className="w-full text-left text-[13px] sm:text-sm border-collapse whitespace-nowrap" {...props} />
    </div>
  ),
  thead: (props: any) => <thead className="bg-stone-100/80 text-stone-700" {...props} />,
  th: (props: any) => <th className="px-4 py-2.5 font-semibold border-b border-stone-200" {...props} />,
  td: (props: any) => <td className="px-4 py-2.5 border-b border-stone-100 text-stone-600 last:border-b-0" {...props} />,
  // Math blocks wrapper to prevent overflow
  div: (props: any) => {
    if (props.className && props.className.includes('math-display')) {
      return (
        <div className="overflow-x-auto custom-scrollbar py-2 my-2 w-full text-center">
          <div {...props} />
        </div>
      );
    }
    return <div {...props} />;
  }
};
