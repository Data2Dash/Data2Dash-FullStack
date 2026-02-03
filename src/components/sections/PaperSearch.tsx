import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search } from 'lucide-react';
import { Input } from '../ui/Input';
import { Card, CardContent } from '../ui/Card';
import { Badge } from '../ui/Badge';
import { PaperInteractionPanel } from './PaperInteractionPanel';

export function PaperSearch() {
  const [searchQuery, setSearchQuery] = useState('');
  const [papers, setPapers] = useState<any[]>([]);
  const [selectedPaper, setSelectedPaper] = useState<any | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const response = await fetch('http://localhost:8000/api/papers/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery })
      });
      const data = await response.json();
      if (data.papers && Array.isArray(data.papers)) {
        setPapers(data.papers);
      }
    } catch (error) {
      console.error("Search error:", error);
    } finally {
      setIsSearching(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <section className="bg-slate-50 py-20 min-h-screen bg-grid-slate-100" id="search">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center">
          <Badge variant="secondary" className="mb-4 bg-white shadow-sm border-slate-200">Section 1</Badge>
          <h2 className="mb-4 text-4xl font-bold text-slate-900 tracking-tight">Web Paper Search & Analysis</h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">Search millions of papers from arXiv, IEEE, and Semantic Scholar with AI-powered insights.</p>
        </div>

        <div className="mx-auto max-w-6xl">
          <div className="relative mb-10 max-w-2xl mx-auto">
            <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full opacity-50" />
            <div className="relative">
              <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <Input 
                className="pl-12 h-14 text-lg shadow-lg border-slate-200 focus:border-indigo-500 focus:ring-indigo-500/20 rounded-2xl" 
                placeholder="Search for keywords, titles, or authors..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isSearching}
              />
              {isSearching && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-3 h-[600px]">
            {/* Results List */}
            <div className="space-y-4 lg:col-span-1 overflow-y-auto pr-2 custom-scrollbar">
              {papers.length === 0 && !isSearching ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center">
                  <Search className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">Search for papers to see results here.</p>
                </div>
              ) : (
                papers.map((paper) => (
                  <motion.div
                    key={paper.id}
                    whileHover={{ scale: 1.02, x: 5 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Card 
                      className={`cursor-pointer transition-all duration-300 hover:shadow-md border-transparent ${selectedPaper?.id === paper.id ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-lg bg-white' : 'bg-white/60 hover:bg-white'}`}
                      onClick={() => setSelectedPaper(paper)}
                    >
                      <CardContent className="p-5">
                        <div className="mb-3 flex items-start justify-between">
                          <Badge variant="outline" className="text-[10px] bg-slate-100 border-slate-200">{paper.source}</Badge>
                          <span className="text-xs font-medium text-slate-400">{paper.date}</span>
                        </div>
                        <h3 className="mb-2 font-bold leading-tight text-slate-900">{paper.title}</h3>
                        <p className="text-sm text-slate-500 font-medium">{paper.authors}</p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))
              )}
            </div>

            {/* Interaction Panel */}
            <div className="lg:col-span-2 h-full">
              <AnimatePresence mode="wait">
                {selectedPaper ? (
                  <motion.div
                    key={selectedPaper.id}
                    initial={{ opacity: 0, x: 20, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -20, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    className="h-full"
                  >
                    <PaperInteractionPanel 
                      title={selectedPaper.title}
                      subtitle={`${selectedPaper.authors} • ${selectedPaper.date}`}
                      initialMessage={
                        <>
                          Hello! I've analyzed <strong className="text-indigo-600">{selectedPaper.title}</strong>. Ask me anything about the methodology, results, or specific figures.
                        </>
                      }
                      onClose={() => setSelectedPaper(null)}
                      onSendMessage={async (message) => {
                        try {
                          const contextQuery = `Context: I am asking about the paper "${selectedPaper.title}" by ${selectedPaper.authors}. Abstract: ${selectedPaper.abstract}. Question: ${message}`;
                          const response = await fetch('http://localhost:8000/api/search', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ query: contextQuery })
                          });
                          const data = await response.json();
                          return data;
                        } catch (error) {
                          console.error("Search error:", error);
                          throw error;
                        }
                      }}
                    />
                  </motion.div>
                ) : (
                  <div className="flex h-full items-center justify-center rounded-3xl border-2 border-dashed border-slate-200 bg-slate-50/50 p-12 text-center backdrop-blur-sm">
                    <div className="max-w-xs">
                      <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-indigo-50 text-indigo-500">
                        <Search className="h-10 w-10" />
                      </div>
                      <h3 className="text-xl font-bold text-slate-900 mb-2">Select a paper</h3>
                      <p className="text-slate-500">Choose a paper from the list to start analyzing with AI.</p>
                    </div>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
