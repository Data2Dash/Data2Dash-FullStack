import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ArrowRight, X, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { Input } from '../ui/Input';
import { Badge } from '../ui/Badge';
import { PaperInteractionPanel } from './PaperInteractionPanel';

const SUGGESTIONS = [
  'Transformer architectures in NLP',
  'Protein folding with AlphaFold',
  'Diffusion models for image generation',
  'Reinforcement learning from human feedback',
];

export function PaperSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [papers, setPapers] = useState<any[]>([]);
  const [selectedPaper, setSelectedPaper] = useState<any | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (query?: string) => {
    const q = query ?? searchQuery;
    if (!q.trim()) return;
    setSearchQuery(q);
    setSubmittedQuery(q);
    setIsSearching(true);
    setHasSearched(true);
    setSelectedPaper(null);
    try {
      const response = await fetch('http://localhost:8000/api/papers/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q }),
      });
      const data = await response.json();
      if (data.papers && Array.isArray(data.papers)) {
        setPapers(data.papers);
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="min-h-screen bg-stone-50 pt-14 flex flex-col">
      {/* ── STICKY SEARCH BAR (after first search) ── */}
      {hasSearched && (
        <div className={clsx(
          "sticky top-14 z-30 bg-white/90 backdrop-blur-sm border-b border-stone-100 py-3 px-6 transition-all duration-500 ease-in-out",
          selectedPaper && "lg:pr-[42%]"
        )}>
          <div className="max-w-3xl mx-auto flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
              <Input
                className="pl-10 h-10 rounded-xl text-sm"
                placeholder="Search papers…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isSearching}
              />
            </div>
            <button
              onClick={() => handleSearch()}
              disabled={isSearching || !searchQuery.trim()}
              className="px-4 h-10 rounded-xl bg-stone-900 text-white text-sm font-medium hover:bg-stone-700 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Search'}
            </button>
          </div>
        </div>
      )}

      {/* ── EMPTY STATE / centered search ── */}
      <AnimatePresence mode="wait">
        {!hasSearched && (
          <motion.div
            key="empty"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="flex-1 flex flex-col items-center justify-center px-6 py-24"
          >
            <div className="max-w-2xl w-full mx-auto text-center">
              <div className="inline-flex p-3 rounded-2xl bg-white border border-stone-200 shadow-soft mb-6">
                <Search className="h-6 w-6 text-stone-500" />
              </div>
              <h1 className="text-3xl font-bold text-stone-900 mb-2">Search research papers</h1>
              <p className="text-stone-500 mb-8 text-base">
                Powered by arXiv, IEEE &amp; Semantic Scholar
              </p>

              {/* Big search bar */}
              <div className="relative w-full mb-4">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-stone-400" />
                <input
                  className="w-full h-14 rounded-2xl border border-stone-200 bg-white pl-12 pr-14 text-base text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:border-stone-400 shadow-soft transition-all"
                  placeholder="Search for keywords, titles, or authors…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                />
                <button
                  onClick={() => handleSearch()}
                  disabled={!searchQuery.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-xl bg-stone-900 text-white flex items-center justify-center hover:bg-stone-700 disabled:opacity-30 transition-colors"
                >
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              {/* Suggestion chips */}
              <div className="flex flex-wrap justify-center gap-2 mt-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSearch(s)}
                    className="px-3.5 py-1.5 rounded-full border border-stone-200 bg-white text-sm text-stone-600 hover:border-stone-400 hover:text-stone-900 transition-all shadow-soft"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── RESULTS FEED ── */}
      {hasSearched && (
        <div className={`flex-1 flex relative overflow-hidden transition-all duration-300`}>
          {/* Paper Feed */}
          <div className={`flex-1 overflow-y-auto px-6 py-8 transition-all duration-300 ${selectedPaper ? 'lg:pr-[42%]' : ''}`}>
            <div className="max-w-3xl mx-auto">
              {isSearching ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4">
                  <Loader2 className="h-8 w-8 animate-spin text-stone-400" />
                  <p className="text-stone-500 text-sm">Searching papers…</p>
                </div>
              ) : papers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-stone-400 gap-3">
                  <Search className="h-8 w-8 opacity-40" />
                  <p className="text-sm">No papers found for "{submittedQuery}"</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-stone-400 mb-6">
                    {papers.length} result{papers.length !== 1 ? 's' : ''} for{' '}
                    <span className="font-medium text-stone-600">"{submittedQuery}"</span>
                  </p>
                  {papers.map((paper, idx) => (
                    <motion.div
                      key={paper.id || idx}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: idx * 0.04 }}
                    >
                      <PaperCard
                        paper={paper}
                        isSelected={selectedPaper?.id === paper.id}
                        onSelect={() => setSelectedPaper(paper.id === selectedPaper?.id ? null : paper)}
                      />
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Slide-in AI Panel */}
          <AnimatePresence>
            {selectedPaper && (
              <motion.div
                key="panel"
                initial={{ x: '100%', opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '100%', opacity: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 32 }}
                className="fixed right-0 top-14 bottom-0 w-full lg:w-[42%] border-l border-stone-200 bg-white shadow-panel z-40 flex flex-col"
              >
                <PaperInteractionPanel
                  title={selectedPaper.title}
                  subtitle={`${selectedPaper.authors} · ${selectedPaper.date}`}
                  initialMessage={
                    <>
                      I've analyzed <strong className="text-stone-900">{selectedPaper.title}</strong>. Ask me anything about the methodology, results, or figures.
                    </>
                  }
                  onClose={() => setSelectedPaper(null)}
                  onSendMessage={async (message) => {
                    const contextQuery = `Context: Paper "${selectedPaper.title}" by ${selectedPaper.authors}. Abstract: ${selectedPaper.abstract}. Question: ${message}`;
                    const response = await fetch('http://localhost:8000/api/search', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ query: contextQuery }),
                    });
                    return await response.json();
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function PaperCard({
  paper,
  isSelected,
  onSelect,
}: {
  paper: any;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-6 transition-all duration-200 cursor-pointer group ${isSelected
        ? 'border-stone-400 shadow-card ring-1 ring-stone-300'
        : 'border-stone-200 hover:border-stone-300 hover:shadow-soft'
        }`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline">{paper.source}</Badge>
          <span className="text-xs text-stone-400">{paper.date}</span>
        </div>
      </div>

      {/* Title & Authors */}
      <h3 className="font-semibold text-stone-900 leading-snug mb-1.5 text-base">
        {paper.title}
      </h3>
      <p className="text-sm text-stone-500 mb-4">{paper.authors}</p>

      {/* Abstract preview */}
      {paper.abstract && (
        <p className="text-sm text-stone-500 leading-relaxed line-clamp-2 mb-4">
          {paper.abstract}
        </p>
      )}

      {/* Action */}
      <button
        onClick={onSelect}
        className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${isSelected
          ? 'bg-stone-900 text-white'
          : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
          }`}
      >
        {isSelected ? (
          <>
            <X className="h-3.5 w-3.5" /> Close Panel
          </>
        ) : (
          <>
            Analyze with AI <ArrowRight className="h-3.5 w-3.5" />
          </>
        )}
      </button>
    </div>
  );
}
