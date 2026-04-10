import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Send, Loader2, Sparkles, BookOpen, Layers, Database, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { Badge } from '../ui/Badge';
import { PaperInteractionPanel } from './PaperInteractionPanel';

interface Paper {
  id: string;
  title: string;
  authors: string;
  date: string;
  source: string;
  abstract: string;
  url: string;
}

const ITEMS_PER_PAGE = 10;

export function PaperSearch() {
  const [inputValue, setInputValue] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [papers, setPapers] = useState<Paper[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalResults, setTotalResults] = useState(0);
  
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [pdfFileName, setPdfFileName] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfSize, setPdfSize] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchPapers = async (query: string, page: number) => {
    if (!query.trim()) return;
    setIsLoading(true);
    
    try {
      const response = await fetch('http://localhost:8000/api/papers/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, page, per_page: ITEMS_PER_PAGE }),
      });
      const data = await response.json();
      
      if (data.papers) {
        setPapers(data.papers);
        setHasMore(data.has_more);
        setTotalResults(data.total || 0);
      } else {
        setPapers([]);
        setHasMore(false);
        setTotalResults(0);
      }
    } catch (error) {
      console.error('Search error:', error);
      setPapers([]);
      setHasMore(false);
    } finally {
      setIsLoading(false);
      if (scrollRef.current) {
        scrollRef.current.scrollTop = 0;
      }
    }
  };

  const handleSearchSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputValue.trim() || isLoading) return;
    setActiveQuery(inputValue);
    setCurrentPage(1);
    fetchPapers(inputValue, 1);
  };

  const handleNextPage = () => {
    if (!hasMore || isLoading) return;
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    fetchPapers(activeQuery, nextPage);
  };

  const handlePrevPage = () => {
    if (currentPage <= 1 || isLoading) return;
    const prevPage = currentPage - 1;
    setCurrentPage(prevPage);
    fetchPapers(activeQuery, prevPage);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSearchSubmit();
    }
  };

  const handlePaperSelect = async (paper: Paper) => {
    if (selectedPaper?.id === paper.id) {
      setSelectedPaper(null);
      setPdfFileName(null);
      setPdfUrl(null);
      setPdfSize(null);
      return;
    }

    setSelectedPaper(paper);
    setPdfFileName(null);
    setPdfUrl(null);
    setPdfSize(null);
    setIsImporting(true);

    try {
      // Trigger backend import for figure extraction
      const response = await fetch('http://localhost:8000/api/pdf/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paper_id: paper.id,
          session_id: "default",
          title: paper.title
        }),
      });
      const data = await response.json();
      if (data.filename) {
        setPdfFileName(data.filename);
      }
      if (data.pdf_url) {
        setPdfUrl(data.pdf_url);
      }
      if (data.pdf_size) {
        setPdfSize(data.pdf_size);
      }
    } catch (error) {
      console.error('Import error:', error);
    } finally {
      setIsImporting(false);
    }
  };

  const hasSearched = activeQuery !== '';

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col bg-stone-50 overflow-hidden relative">
      
      {/* ── MAIN CONTENT AREA ── */}
      <div 
        ref={scrollRef} 
        className={clsx(
          "flex-1 overflow-y-auto px-4 w-full transition-all duration-500 custom-scrollbar",
          hasSearched ? "py-8" : "flex items-center justify-center -mt-20"
        )}
      >
        <div className={clsx(
          "mx-auto w-full max-w-4xl transition-all duration-500",
          selectedPaper && "lg:mr-[42%]"
        )}>
          
          {/* SEARCH HEADER (Transforms from Center to Top) */}
          <div className={clsx(
            "flex flex-col mb-8 transition-all duration-500",
            !hasSearched ? "items-center text-center scale-105" : "items-start text-left"
          )}>
            {!hasSearched && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-3xl bg-white border border-stone-200 shadow-soft mb-6"
              >
                <Sparkles className="h-8 w-8 text-stone-900" />
              </motion.div>
            )}
            
            <h1 className={clsx(
              "font-bold text-stone-900 transition-all duration-300",
              !hasSearched ? "text-4xl mb-3" : "text-2xl mb-4"
            )}>
              Academic Search Engine
            </h1>
            
            {!hasSearched && (
              <p className="text-stone-500 mb-8 max-w-lg mx-auto">
                Discover millions of research papers from ArXiv, IEEE, and Semantic Scholar in one place.
              </p>
            )}

            {/* SEARCH INPUT */}
            <div className={clsx(
              "relative flex items-center w-full bg-white rounded-2xl border transition-all duration-300",
              hasSearched ? "border-stone-200 shadow-sm" : "border-stone-300 shadow-lg ring-4 ring-stone-100"
            )}>
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-stone-400" />
              <input
                className="w-full h-14 bg-transparent pl-12 pr-16 text-lg text-stone-900 placeholder:text-stone-400 focus:outline-none transition-all"
                placeholder="Search authors, topics, or papers..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
              />
              <button
                onClick={handleSearchSubmit}
                disabled={isLoading || !inputValue.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 rounded-xl bg-stone-900 text-white flex items-center justify-center hover:bg-stone-800 disabled:opacity-40 transition-all"
              >
                {isLoading && !hasSearched ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 ml-0.5" />}
              </button>
            </div>
            
            {hasSearched && !isLoading && (
              <div className="flex items-center gap-4 mt-6 opacity-70 text-sm font-medium text-stone-500">
                <span>Sources:</span>
                <span className="flex items-center gap-1"><BookOpen className="h-4 w-4" /> ArXiv</span>
                <span className="flex items-center gap-1"><Layers className="h-4 w-4" /> IEEE</span>
                <span className="flex items-center gap-1"><Database className="h-4 w-4" /> Semantic</span>
              </div>
            )}
          </div>

          {/* LOADING STATE */}
          {isLoading && hasSearched && (
            <div className="flex flex-col items-center justify-center py-20 opacity-60">
              <Loader2 className="h-8 w-8 animate-spin text-stone-400 mb-4" />
              <p className="text-stone-500 font-medium">Fetching research papers...</p>
            </div>
          )}

          {/* SEARCH RESULTS LIST */}
          {!isLoading && hasSearched && (
            <AnimatePresence mode="wait">
              <motion.div 
                key={currentPage}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col gap-5 pb-8"
              >
                <div className="mb-2 text-sm text-stone-500 font-medium">
                  {totalResults > 0 
                    ? `Page ${currentPage} (approx. ${totalResults.toLocaleString()} results)`
                    : 'No papers found'
                  }
                </div>

                {papers.map((paper, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => handlePaperSelect(paper)}
                    className={clsx(
                      "bg-white border rounded-2xl p-6 transition-all duration-200 cursor-pointer group shadow-soft",
                      selectedPaper?.id === paper.id
                        ? 'border-stone-400 ring-1 ring-stone-300'
                        : 'border-stone-200 hover:border-stone-300 hover:shadow-card'
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4 mb-3">
                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider bg-stone-50">
                          {paper.source || 'Journal'}
                        </Badge>
                        {paper.date && (
                          <Badge variant="secondary" className="text-[10px] font-medium bg-white text-stone-500">
                            {paper.date}
                          </Badge>
                        )}
                      </div>
                      
                      {paper.url && (
                        <a 
                          href={paper.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-100 text-stone-700 hover:bg-stone-900 hover:text-white text-xs font-semibold rounded-lg transition-colors"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          View PDF
                        </a>
                      )}
                    </div>
                    
                    <h2 className="text-lg font-bold text-stone-900 leading-tight mb-2 pr-6 group-hover:text-stone-700 transition-colors">
                      {paper.title}
                    </h2>
                    
                    <p className="text-sm font-medium text-blue-600 mb-3 truncate">
                      {paper.authors}
                    </p>
                    
                    {paper.abstract && (
                      <p className="text-sm text-stone-600 leading-relaxed line-clamp-3">
                        {paper.abstract}
                      </p>
                    )}
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          )}

          {/* PAGINATION CONTROLS */}
          {!isLoading && hasSearched && papers.length > 0 && (
            <div className="flex items-center justify-between border-t border-stone-200 pt-6 pb-12 mt-6">
              <button
                onClick={handlePrevPage}
                disabled={currentPage <= 1}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-stone-200 bg-white text-stone-700 font-medium hover:bg-stone-50 hover:border-stone-300 disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-stone-200 transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
              
              <span className="text-sm font-semibold text-stone-500 px-4">
                Page {currentPage}
              </span>
              
              <button
                onClick={handleNextPage}
                disabled={!hasMore}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-stone-200 bg-white text-stone-700 font-medium hover:bg-stone-50 hover:border-stone-300 disabled:opacity-40 disabled:hover:bg-white disabled:hover:border-stone-200 transition-colors"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}

        </div>
      </div>

      {/* ── SLIDE-IN AI PANEL ── */}
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
              fileName={pdfFileName}
              pdfUrl={pdfUrl}
              pdfSize={pdfSize}
              initialMessage={
                isImporting ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-stone-900" />
                    <span className="text-stone-600 font-medium text-sm">Processing paper and extracting figures...</span>
                  </div>
                ) : (
                  <>
                    I've analyzed <strong className="text-stone-900">{selectedPaper.title}</strong>. Ask me anything about the methodology, results, or figures.
                  </>
                )
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
  );
}
