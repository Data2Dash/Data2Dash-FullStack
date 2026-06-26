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
import { Copy, Check, Hash, Table2, ChevronDown, ChevronUp } from 'lucide-react';

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
    <div className="my-4 rounded-2xl border border-violet-200/70 dark:border-violet-500/20 bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-violet-500/10 dark:to-indigo-500/10 overflow-hidden shadow-sm equation-block-hover">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-violet-100/60 dark:bg-violet-500/15 border-b border-violet-200/50 dark:border-violet-500/20">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-md bg-violet-600 flex items-center justify-center">
            <Hash className="h-3 w-3 text-white" />
          </div>
          <span className="text-xs font-bold text-violet-700 dark:text-violet-400 uppercase tracking-wide">
            {label}
          </span>
          {eq.page_number != null && (
            <span className="text-[10px] font-semibold text-violet-400 bg-violet-100 dark:bg-violet-500/20 px-1.5 py-0.5 rounded-full">
              p. {eq.page_number}
            </span>
          )}
        </div>
        {(latex || raw) && (
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-[11px] font-medium text-violet-500 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors px-2 py-0.5 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-500/20"
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
          <pre className="text-sm text-slate-700 dark:text-zinc-300 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
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
  html_table?: string;
  page_number?: number;
  description?: string;
  section?: string;
}

function TableBlock({ tb }: { tb: TableData }) {
  const [showRaw, setShowRaw] = useState(false);
  const label = tb.label ?? `Table ${tb.global_number ?? '?'}`;
  const caption = tb.caption ?? '';
  const md = cleanTableMarkdown(tb.markdown ?? '');
  const raw = tb.raw_text ?? '';

  return (
    <div className="my-4 rounded-2xl border border-emerald-200/70 dark:border-emerald-500/20 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10 overflow-hidden shadow-sm table-block-hover">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-emerald-100/60 dark:bg-emerald-500/15 border-b border-emerald-200/50 dark:border-emerald-500/20">
        <div className="h-5 w-5 rounded-md bg-emerald-600 flex items-center justify-center shrink-0">
          <Table2 className="h-3 w-3 text-white" />
        </div>
        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide shrink-0">
          {label}
        </span>
        {tb.section && (
          <span className="text-[10px] text-emerald-500 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-500/10 px-1.5 py-0.5 rounded-full border border-emerald-200/40 dark:border-emerald-500/20 truncate max-w-[160px]">
            {tb.section}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {raw && (
            <button
              onClick={() => setShowRaw(!showRaw)}
              className="flex items-center gap-1 text-[10px] font-medium text-emerald-500 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors px-1.5 py-0.5 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-500/20"
              title={showRaw ? 'Show formatted' : 'Show raw data'}
            >
              {showRaw ? <ChevronUp className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}
              <span>{showRaw ? 'Formatted' : 'Raw'}</span>
            </button>
          )}
          {tb.page_number != null && (
            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-100 dark:bg-emerald-500/20 px-1.5 py-0.5 rounded-full">
              p. {tb.page_number}
            </span>
          )}
        </div>
      </div>

      {/* Caption */}
      {caption && caption !== label && (
        <div className="px-4 pt-2.5 pb-0">
          <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400 italic leading-relaxed">{caption}</p>
        </div>
      )}

      {/* Table body */}
      <div className="px-4 py-3 overflow-x-auto">
        {showRaw ? (
          <pre className="text-[11px] text-slate-600 dark:text-zinc-400 overflow-x-auto whitespace-pre-wrap font-mono bg-white/60 dark:bg-zinc-900/60 rounded-lg p-3 border border-emerald-100 dark:border-emerald-500/20 leading-relaxed">
            {raw}
          </pre>
        ) : md ? (
          <div className="table-enhanced prose prose-sm max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                ...codeComponents,
                table: ({ children, ...props }) => (
                  <table className="w-full border-collapse text-xs" {...props}>{children}</table>
                ),
                thead: ({ children, ...props }) => (
                  <thead className="bg-emerald-100/80 dark:bg-emerald-500/15" {...props}>{children}</thead>
                ),
                th: ({ children, ...props }) => (
                  <th className="text-left text-emerald-900 dark:text-emerald-300 font-bold text-[11px] px-3 py-2 border border-emerald-200/60 dark:border-emerald-500/20 whitespace-nowrap" {...props}>{children}</th>
                ),
                td: ({ children, ...props }) => (
                  <td className="text-stone-700 dark:text-zinc-300 text-[11px] px-3 py-1.5 border border-emerald-200/40 dark:border-emerald-500/20 whitespace-nowrap tabular-nums" {...props}>{children}</td>
                ),
                tr: ({ children, ...props }) => (
                  <tr className="even:bg-emerald-50/40 dark:even:bg-emerald-500/5 hover:bg-emerald-100/30 dark:hover:bg-emerald-500/10 transition-colors" {...props}>{children}</tr>
                ),
              }}
            >
              {md}
            </ReactMarkdown>
          </div>
        ) : raw ? (
          <pre className="text-[11px] text-slate-600 dark:text-zinc-400 overflow-x-auto whitespace-pre-wrap font-mono bg-white/60 dark:bg-zinc-900/60 rounded-lg p-3 border border-emerald-100 dark:border-emerald-500/20">
            {raw}
          </pre>
        ) : null}
      </div>

      {/* Description / context note */}
      {tb.description && (
        <div className="px-4 pb-3 pt-0">
          <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/80 leading-relaxed border-t border-emerald-200/30 dark:border-emerald-500/20 pt-2">
            {tb.description}
          </p>
        </div>
      )}
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
