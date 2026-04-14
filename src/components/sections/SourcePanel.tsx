import React, { useState } from 'react';
import { X, Search, Sparkles, Plus, Loader2, AlertTriangle } from 'lucide-react';
import { CitationPaper, CitationStyle, isDuplicate, searchCitations } from '../../api/citationApi';
import { PaperCard } from './citation/PaperCard';
import { ImportModal } from './citation/ImportModal';

interface SourcePanelProps {
  isOpen: boolean;
  query: string;
  papers: CitationPaper[];
  isSearching: boolean;
  citedPaperIds: Set<string>;
  citingPaperId: string | null;
  existingPapers: CitationPaper[];
  onCite: (paper: CitationPaper) => void;
  onClose: () => void;
  onImport: (paper: CitationPaper) => void;
}

export function SourcePanel({
  isOpen,
  query,
  papers,
  isSearching,
  citedPaperIds,
  citingPaperId,
  existingPapers,
  onCite,
  onClose,
  onImport,
}: SourcePanelProps) {
  const [manualQuery, setManualQuery] = useState('');
  const [manualResults, setManualResults] = useState<CitationPaper[]>([]);
  const [manualSearching, setManualSearching] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [sortBy, setSortBy] = useState<'relevance' | 'year'>('relevance');

  const handleManualSearch = async () => {
    if (!manualQuery.trim()) return;
    setManualSearching(true);
    setManualResults([]);
    try {
      const results = await searchCitations(manualQuery);
      setManualResults(results);
    } catch {
      setManualResults([]);
    } finally {
      setManualSearching(false);
    }
  };

  const displayPapers = manualResults.length > 0 ? manualResults : papers;
  const sorted = [...displayPapers].sort((a, b) => {
    if (sortBy === 'year') return parseInt(b.year) - parseInt(a.year);
    return (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0);
  });

  if (!isOpen) return null;

  return (
    <>
      {/* Panel */}
      <aside className="w-[380px] shrink-0 border-l border-stone-200 bg-white flex flex-col h-full overflow-hidden animate-slide-in-right">
        {/* Panel Header */}
        <div className="p-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/60">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 bg-stone-900 rounded-lg flex items-center justify-center">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <span className="text-xs font-bold text-stone-700 uppercase tracking-widest">
              Citation Sources
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-stone-300 hover:text-stone-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Query display */}
        <div className="px-4 pt-4 pb-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-1.5">
            Searching for
          </p>
          <p className="text-xs text-stone-600 bg-sage-50 border border-sage-100 rounded-xl px-3 py-2 leading-relaxed line-clamp-2 italic">
            "{query}"
          </p>
        </div>

        {/* Sort + controls */}
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="flex gap-1">
            {(['relevance', 'year'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase transition-all ${
                  sortBy === s
                    ? 'bg-stone-900 text-white'
                    : 'text-stone-400 hover:text-stone-600'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <span className="text-[10px] text-stone-400 font-medium">
            {sorted.length > 0 ? `${sorted.length} results` : ''}
          </span>
        </div>

        {/* Results scrollable area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-4">
          {isSearching || manualSearching ? (
            // Skeleton loading
            <div className="space-y-3 pt-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-stone-50 border border-stone-100 rounded-2xl p-4 animate-pulse">
                  <div className="h-1.5 bg-stone-200 rounded-full w-3/4 mb-3" />
                  <div className="h-3 bg-stone-200 rounded w-full mb-1.5" />
                  <div className="h-3 bg-stone-200 rounded w-2/3 mb-3" />
                  <div className="flex gap-2">
                    <div className="h-2.5 bg-stone-100 rounded w-12" />
                    <div className="h-2.5 bg-stone-100 rounded w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : sorted.length > 0 ? (
            <div className="space-y-3 pt-2">
              {sorted.map((paper) => {
                const dup = isDuplicate(paper, existingPapers);
                return (
                  <div key={paper.id} className="relative">
                    {dup && (
                      <div className="flex items-center gap-1 text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1 mb-1">
                        <AlertTriangle className="h-3 w-3" />
                        Already in references
                      </div>
                    )}
                    <PaperCard
                      paper={paper}
                      isCiting={citingPaperId === paper.id}
                      isCited={citedPaperIds.has(paper.id)}
                      onCite={onCite}
                    />
                  </div>
                );
              })}
            </div>
          ) : (
            // Empty state
            <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
              <div className="h-12 w-12 bg-stone-100 rounded-2xl flex items-center justify-center">
                <Search className="h-5 w-5 text-stone-300" />
              </div>
              <p className="text-sm font-semibold text-stone-600">No papers found</p>
              <p className="text-xs text-stone-400 max-w-[200px]">
                Try searching manually, using fewer words, or importing by DOI/URL.
              </p>
            </div>
          )}
        </div>

        {/* Bottom actions */}
        <div className="p-4 border-t border-stone-100 space-y-2">
          {/* Manual search */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400" />
              <input
                type="text"
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                placeholder="Search manually…"
                className="w-full bg-stone-50 border border-stone-200 rounded-xl py-2 pl-8 pr-3 text-xs text-stone-900 focus:ring-1 focus:ring-sage-200 focus:border-sage-400 outline-none transition-all"
              />
            </div>
            <button
              onMouseDown={(e) => { e.preventDefault(); handleManualSearch(); }}
              disabled={manualSearching || !manualQuery.trim()}
              className="px-3 py-2 bg-stone-900 text-white rounded-xl text-xs font-bold hover:bg-stone-700 transition-all disabled:opacity-40 active:scale-95 flex items-center gap-1"
            >
              {manualSearching ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Go'}
            </button>
          </div>

          {/* Import by DOI */}
          <button
            onClick={() => setShowImport(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2 border border-stone-200 rounded-xl text-xs font-semibold text-stone-500 hover:text-stone-900 hover:border-stone-300 hover:bg-stone-50 transition-all"
          >
            <Plus className="h-3.5 w-3.5" />
            Import by DOI / URL / Title
          </button>
        </div>
      </aside>

      {/* Import Modal */}
      {showImport && (
        <ImportModal
          onImport={(paper) => { onImport(paper); setShowImport(false); }}
          onClose={() => setShowImport(false)}
        />
      )}
    </>
  );
}
