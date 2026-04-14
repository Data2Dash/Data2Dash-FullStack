import React from 'react';
import { ExternalLink, BookOpen, ChevronDown, ChevronUp, Star, Loader2, Check, Library } from 'lucide-react';
import { CitationPaper } from '../../../api/citationApi';

interface PaperCardProps {
  paper: CitationPaper;
  isCiting: boolean;
  isCited: boolean;
  onCite: (paper: CitationPaper) => void;
}

export function PaperCard({ paper, isCiting, isCited, onCite }: PaperCardProps) {
  const [expanded, setExpanded] = React.useState(false);

  const score = paper.relevanceScore ?? 0;
  const scoreColor =
    score >= 85 ? 'bg-sage-500' :
    score >= 65 ? 'bg-sage-400' :
    'bg-stone-300';

  const authors = paper.authors?.length > 0
    ? paper.authors.slice(0, 3).join(', ') + (paper.authors.length > 3 ? ` +${paper.authors.length - 3} more` : '')
    : 'Unknown authors';

  const venue = paper.journal || paper.conference;

  return (
    <div className="group relative bg-white border border-stone-100 rounded-2xl p-4 hover:border-sage-200 hover:shadow-card transition-all duration-200">
      {/* Relevance bar */}
      {paper.relevanceScore !== undefined && (
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 h-1 bg-stone-100 rounded-full overflow-hidden">
            <div
              className={`h-full ${scoreColor} rounded-full transition-all duration-700`}
              style={{ width: `${score}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-stone-400 tabular-nums whitespace-nowrap">
            {score}% match
          </span>
        </div>
      )}

      {/* Title */}
      <h4 className="text-sm font-bold text-stone-900 leading-snug group-hover:text-sage-700 transition-colors line-clamp-2 mb-1.5">
        {paper.title}
      </h4>

      {/* Authors */}
      <p className="text-[11px] text-stone-500 font-medium mb-2">{authors}</p>

      {/* Meta row */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
        {paper.year && (
          <span className="text-[11px] font-semibold text-stone-400">{paper.year}</span>
        )}
        {venue && (
          <span className="text-[11px] text-stone-400 italic truncate max-w-[150px]">{venue}</span>
        )}
        {paper.citationCount !== undefined && (
          <span className="flex items-center gap-0.5 text-[11px] text-stone-400">
            <Star className="h-3 w-3" />
            {paper.citationCount.toLocaleString()}
          </span>
        )}
        {paper.doi && (
          <a
            href={`https://doi.org/${paper.doi}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-0.5 text-[11px] font-bold text-sage-600 hover:text-sage-800 underline"
            onClick={(e) => e.stopPropagation()}
          >
            DOI <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
        {paper.url && !paper.doi && (
          <a
            href={paper.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-0.5 text-[11px] font-bold text-sage-600 hover:text-sage-800 underline"
            onClick={(e) => e.stopPropagation()}
          >
            PDF <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
      </div>

      {/* Abstract preview */}
      {paper.abstract && (
        <div className="mb-3">
          <button
            className="flex items-center gap-1 text-[10px] text-stone-400 hover:text-stone-600 font-semibold uppercase tracking-wide transition-colors"
            onClick={() => setExpanded(v => !v)}
          >
            <BookOpen className="h-3 w-3" />
            Abstract
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          {expanded && (
            <p className="mt-1.5 text-[11px] text-stone-500 leading-relaxed line-clamp-4">
              {paper.abstract}
            </p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 pt-2 border-t border-stone-50">
        <button
          className="flex items-center gap-1 text-[11px] text-stone-400 hover:text-stone-700 font-medium transition-colors"
          title="Save to library"
        >
          <Library className="h-3.5 w-3.5" />
          Save
        </button>

        <button
          onMouseDown={(e) => {
            e.preventDefault(); // keep editor focus / marker alive
            onCite(paper);
          }}
          disabled={isCiting || isCited}
          className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[11px] font-bold transition-all active:scale-95
            ${isCited
              ? 'bg-sage-50 text-sage-600 border border-sage-200 cursor-default'
              : 'bg-stone-900 text-white hover:bg-stone-700 shadow-soft disabled:opacity-50'
            }`}
        >
          {isCiting ? (
            <><Loader2 className="h-3 w-3 animate-spin" /> Citing…</>
          ) : isCited ? (
            <><Check className="h-3 w-3" /> Cited</>
          ) : (
            'Cite'
          )}
        </button>
      </div>
    </div>
  );
}
