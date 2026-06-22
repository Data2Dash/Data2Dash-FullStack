/**
 * AiMessageRenderer.tsx
 *
 * A premium shared component for rendering AI responses.
 * Handles:
 * - Rich markdown via ReactMarkdown + remark-gfm
 * - LaTeX math via remark-math + rehype-katex
 * - Syntax-highlighted code blocks via react-syntax-highlighter
 * - Structured equation blocks (from structured PDF API responses)
 * - Structured table blocks
 * - Source/citation pills
 *
 * Usage:
 *   <AiMessageRenderer content={msg.content} equations={msg.equations} tables={msg.tables} />
 */
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { codeComponents } from './CodeBlock';
import { cleanTableMarkdown } from '../../utils/tableUtils';
import { normalizeEquations } from '../../utils/mathUtils';
import { Copy, Check, Hash, Table2 } from 'lucide-react';

// ─── Equation Block ───────────────────────────────────────────────────────────

export interface EquationData {
  label?: string;
  global_number?: number;
  normalized_latex?: string;
  latex?: string;
  raw_text?: string;
  text?: string;
  page_number?: number;
}

function EquationBlock({ eq }: { eq: EquationData }) {
  const [copied, setCopied] = useState(false);
  const label = eq.label ?? `Equation ${eq.global_number ?? '?'}`;
  const latex = eq.normalized_latex || eq.latex || '';
  const raw = eq.raw_text || eq.text || '';
  const displayLatex = `$$\n${latex}\n$$`;

  const handleCopy = () => {
    navigator.clipboard.writeText(latex || raw).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="my-4 rounded-2xl border border-violet-200/70 bg-gradient-to-br from-violet-50 to-indigo-50 overflow-hidden shadow-sm equation-block-hover">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-violet-100/60 border-b border-violet-200/50">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-md bg-violet-600 flex items-center justify-center">
            <Hash className="h-3 w-3 text-white" />
          </div>
          <span className="text-xs font-bold text-violet-700 uppercase tracking-wide">
            {label}
          </span>
          {eq.page_number != null && (
            <span className="text-[10px] font-semibold text-violet-400 bg-violet-100 px-1.5 py-0.5 rounded-full">
              p. {eq.page_number}
            </span>
          )}
        </div>
        {(latex || raw) && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[11px] font-medium text-violet-500 hover:text-violet-700 transition-colors px-2 py-0.5 rounded-lg hover:bg-violet-100"
            title="Copy LaTeX"
          >
            {copied ? (
              <><Check className="h-3 w-3 text-emerald-500" /><span className="text-emerald-500">Copied</span></>
            ) : (
              <><Copy className="h-3 w-3" /><span>Copy</span></>
            )}
          </button>
        )}
      </div>
      {/* Body */}
      <div className="px-5 py-3 overflow-x-auto text-center">
        {latex ? (
          <div className="katex-display-wrapper">
            <ReactMarkdown
              remarkPlugins={[remarkMath]}
              rehypePlugins={[rehypeKatex]}
              components={codeComponents}
            >
              {displayLatex}
            </ReactMarkdown>
          </div>
        ) : raw ? (
          <pre className="text-sm text-slate-700 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
            {raw}
          </pre>
        ) : null}
      </div>
    </div>
  );
}

// ─── Table Block ──────────────────────────────────────────────────────────────

export interface TableData {
  label?: string;
  global_number?: number;
  caption?: string;
  markdown?: string;
  raw_text?: string;
  page_number?: number;
}

function TableBlock({ tb }: { tb: TableData }) {
  const label = tb.label ?? `Table ${tb.global_number ?? '?'}`;
  const caption = tb.caption ?? label;
  const md = tb.markdown ?? '';
  const raw = tb.raw_text ?? '';

  return (
    <div className="my-4 rounded-2xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-teal-50 overflow-hidden shadow-sm table-block-hover">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2 bg-emerald-100/60 border-b border-emerald-200/50">
        <div className="h-5 w-5 rounded-md bg-emerald-600 flex items-center justify-center">
          <Table2 className="h-3 w-3 text-white" />
        </div>
        <span className="text-xs font-bold text-emerald-700 uppercase tracking-wide">
          {label}
        </span>
        {caption && caption !== label && (
          <span className="text-xs text-emerald-600 font-medium truncate">
            — {caption}
          </span>
        )}
        {tb.page_number != null && (
          <span className="ml-auto text-[10px] font-semibold text-emerald-400 bg-emerald-100 px-1.5 py-0.5 rounded-full shrink-0">
            p. {tb.page_number}
          </span>
        )}
      </div>
      {/* Body */}
      <div className="px-4 py-3 overflow-x-auto">
        {md ? (
          <div className="prose prose-sm max-w-none prose-table:rounded-xl">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={codeComponents}>
              {md}
            </ReactMarkdown>
          </div>
        ) : raw ? (
          <pre className="text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap font-mono">
            {raw}
          </pre>
        ) : null}
      </div>
    </div>
  );
}

// ─── Main Renderer ────────────────────────────────────────────────────────────

interface AiMessageRendererProps {
  /** The main text/markdown content of the message */
  content: string;
  /** Optional structured equation objects (from PDF agent structured response) */
  equations?: EquationData[];
  /** Optional structured table objects (from PDF agent structured response) */
  tables?: TableData[];
  /** Optional compact mode for smaller panels */
  compact?: boolean;
}

export function AiMessageRenderer({
  content,
  equations,
  tables,
  compact = false,
}: AiMessageRendererProps) {
  const processedContent = cleanTableMarkdown(normalizeEquations(content));

  return (
    <div className={compact ? 'prose prose-sm prose-slate max-w-none text-[13px]' : 'prose prose-sm prose-slate max-w-none'}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          ...codeComponents,
          // Enhanced paragraph
          p: ({ children, ...props }) => (
            <p className="mb-3 last:mb-0 leading-relaxed" {...props}>
              {children}
            </p>
          ),
          // Enhanced headings
          h1: ({ children, ...props }) => (
            <h1 className="text-base font-bold text-slate-900 mt-5 mb-2 border-b border-slate-100 pb-1" {...props}>
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 className="text-sm font-bold text-slate-800 mt-4 mb-2" {...props}>
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 className="text-sm font-semibold text-slate-700 mt-3 mb-1.5" {...props}>
              {children}
            </h3>
          ),
          // Enhanced list items
          ul: ({ children, ...props }) => (
            <ul className="my-2 ml-4 space-y-1" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="my-2 ml-4 space-y-1 list-decimal" {...props}>
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li className="leading-relaxed text-slate-700" {...props}>
              {children}
            </li>
          ),
          // Enhanced strong/em
          strong: ({ children, ...props }) => (
            <strong className="font-semibold text-slate-900" {...props}>
              {children}
            </strong>
          ),
          em: ({ children, ...props }) => (
            <em className="italic text-slate-600" {...props}>
              {children}
            </em>
          ),
          // Horizontal rule
          hr: () => <hr className="my-4 border-slate-200" />,
        }}
      >
        {processedContent}
      </ReactMarkdown>

      {/* Structured equation blocks */}
      {equations && equations.length > 0 && (
        <div className="mt-4 space-y-2 not-prose">
          {equations.map((eq, i) => (
            <EquationBlock key={i} eq={eq} />
          ))}
        </div>
      )}

      {/* Structured table blocks */}
      {tables && tables.length > 0 && (
        <div className="mt-4 space-y-2 not-prose">
          {tables.map((tb, i) => (
            <TableBlock key={i} tb={tb} />
          ))}
        </div>
      )}
    </div>
  );
}

// Re-export for convenience
export { EquationBlock, TableBlock };
