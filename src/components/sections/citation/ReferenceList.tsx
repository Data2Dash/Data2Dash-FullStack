import React from 'react';
import { ExternalLink, AlertCircle, RotateCcw } from 'lucide-react';
import { CitationStyle } from '../../../api/citationApi';
import { Citation } from '../CitationWorkspace';

interface ReferenceListProps {
  citations: Citation[];
  activeStyle: CitationStyle;
  onRetry: (citation: Citation) => void;
}

export function ReferenceList({ citations, activeStyle, onRetry }: ReferenceListProps) {
  if (citations.length === 0) return null;

  return (
    <div className="mt-20 pt-12 border-t border-stone-100 pb-12">
      <h3 className="text-lg font-bold text-stone-900 mb-8 tracking-tight">References</h3>
      <ol className="space-y-5" style={{ counterReset: 'ref-counter' }}>
        {citations.map((cite, idx) => {
          const text = cite[activeStyle];
          const isMissing = !text;

          return (
            <li
              key={cite.id}
              className={`text-sm leading-relaxed font-serif pl-8 relative group ${
                isMissing ? 'text-stone-400' : 'text-stone-600'
              }`}
              style={{ textIndent: '-2rem', paddingLeft: '2rem' }}
            >
              {/* Number */}
              <span className="absolute left-0 top-0 text-stone-400 font-sans font-semibold tabular-nums select-none">
                {idx + 1}.
              </span>

              {isMissing ? (
                <span className="inline-flex items-center gap-2">
                  <AlertCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span className="text-amber-600">
                    Incomplete metadata for {activeStyle.toUpperCase()} format.{' '}
                    <button
                      onClick={() => onRetry(cite)}
                      className="underline hover:text-amber-800 inline-flex items-center gap-0.5"
                    >
                      <RotateCcw className="h-3 w-3" /> Retry
                    </button>
                  </span>
                </span>
              ) : (
                <>
                  {text}
                  {cite.source && (
                    <a
                      href={cite.source}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-1 inline-flex items-center gap-0.5 text-sage-500 hover:text-sage-700 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
