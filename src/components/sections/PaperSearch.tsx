import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Send, Loader2, Quote, Sparkles, BookOpen, Layers, Database, ArrowRight, X } from 'lucide-react';
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

interface Message {
  role: 'user' | 'ai';
  content: string | React.ReactNode;
  papers?: any[];
  isResearch?: boolean;
}

export function PaperSearch() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isResearchMode, setIsResearchMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedPaper, setSelectedPaper] = useState<any | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const handleSearch = async (query?: string) => {
    const q = query ?? inputValue;
    if (!q.trim() || isLoading) return;

    // Add user message
    const newMessage: Message = { role: 'user', content: q };
    setMessages(prev => [...prev, newMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      if (isResearchMode) {
        // Research Mode: Fetch papers
        const response = await fetch('http://localhost:8000/api/papers/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        });
        const data = await response.json();

        const aiMessage: Message = {
          role: 'ai',
          content: data.papers?.length > 0
            ? `I found ${data.papers.length} relevant papers for your research query.`
            : `I couldn't find any specific papers for "${q}", but I can help you explore this topic further.`,
          papers: data.papers || [],
          isResearch: true
        };
        setMessages(prev => [...prev, aiMessage]);
      } else {
        // General Chat Mode
        const response = await fetch('http://localhost:8000/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        });
        const data = await response.json();

        const aiMessage: Message = {
          role: 'ai',
          content: data.response || "I'm sorry, I couldn't process that request."
        };
        setMessages(prev => [...prev, aiMessage]);
      }
    } catch (error) {
      console.error('Search error:', error);
      setMessages(prev => [...prev, { role: 'ai', content: "Sorry, I encountered an error connecting to the backend. Please check if the server is running." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePaperSelect = async (paper: any) => {
    if (selectedPaper?.id === paper.id) {
      setSelectedPaper(null);
      return;
    }

    setSelectedPaper(paper);
    setIsImporting(true);

    try {
      // Trigger backend import for figure extraction
      await fetch('http://localhost:8000/api/pdf/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paper_id: paper.id,
          session_id: "default",
          title: paper.title
        }),
      });
    } catch (error) {
      console.error('Import error:', error);
    } finally {
      setIsImporting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col bg-stone-50 overflow-hidden">
      {/* ── CHAT AREA ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-8 space-y-6 custom-scrollbar transition-all duration-300">
        <div className={clsx("max-w-4xl mx-auto transition-all duration-300", selectedPaper && "lg:mr-[42%]")}>
          <AnimatePresence mode="popLayout">
            {messages.length === 0 ? (
              /* Welcome State */
              <motion.div
                key="welcome"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center py-20 text-center"
              >
                <div className="p-4 rounded-3xl bg-white border border-stone-200 shadow-soft mb-6">
                  <Sparkles className="h-8 w-8 text-stone-900" />
                </div>
                <h1 className="text-3xl font-bold text-stone-900 mb-2">Ask me anything about research</h1>
                <p className="text-stone-500 mb-10 max-w-md mx-auto">
                  Type a topic to chat, or enable <span className="text-stone-900 font-medium">Research Mode</span> to search through ArXiv, IEEE, and Semantic Scholar.
                </p>
                <div className="flex flex-wrap justify-center gap-2 max-w-2xl">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => handleSearch(s)}
                      className="px-4 py-2 rounded-xl border border-stone-200 bg-white text-sm text-stone-600 hover:border-stone-400 hover:text-stone-900 transition-all shadow-soft"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </motion.div>
            ) : (
              /* Conversation History */
              messages.map((msg, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={clsx("flex gap-4 mb-6", msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
                >
                  {/* Avatar */}
                  <div className={clsx(
                    "h-8 w-8 shrink-0 rounded-xl flex items-center justify-center text-[10px] font-bold shadow-sm",
                    msg.role === 'ai' ? 'bg-stone-900 text-white' : 'bg-white border border-stone-200 text-stone-600'
                  )}>
                    {msg.role === 'ai' ? 'AI' : 'YOU'}
                  </div>

                  {/* Bubble */}
                  <div className={clsx(
                    "flex flex-col gap-3 max-w-[85%]",
                    msg.role === 'user' ? 'items-end' : 'items-start'
                  )}>
                    <div className={clsx(
                      "rounded-2xl px-5 py-4 text-sm leading-relaxed shadow-soft",
                      msg.role === 'ai'
                        ? 'bg-white border border-stone-100 text-stone-800'
                        : 'bg-stone-900 text-white'
                    )}>
                      {msg.content}

                      {/* Sources Badge if Research Mode */}
                      {msg.isResearch && (
                        <div className="mt-4 pt-4 border-t border-stone-100">
                          <div className="flex items-center gap-1.5 mb-2.5">
                            <Quote className="h-3 w-3 text-stone-400" />
                            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Sources used</span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary" className="bg-blue-50 text-blue-700 border-blue-100 text-[10px]">ArXiv</Badge>
                            <Badge variant="secondary" className="bg-purple-50 text-purple-700 border-purple-100 text-[10px]">IEEE</Badge>
                            <Badge variant="secondary" className="bg-green-50 text-green-700 border-green-100 text-[10px]">Semantic Scholar</Badge>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Inline Paper Cards */}
                    {msg.papers && msg.papers.length > 0 && (
                      <div className="w-full overflow-x-auto no-scrollbar pb-2">
                        <div className="flex gap-4 min-w-max">
                          {msg.papers.map((paper, pIdx) => (
                            <div key={pIdx} className="w-72">
                              <PaperCard
                                paper={paper}
                                isSelected={selectedPaper?.id === paper.id}
                                onSelect={() => handlePaperSelect(paper)}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              ))
            )}

            {/* AI Loading State */}
            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex gap-4 mb-6"
              >
                <div className="h-8 w-8 rounded-xl bg-stone-900 flex items-center justify-center text-[10px] font-bold text-white shrink-0 shadow-sm">AI</div>
                <div className="bg-white border border-stone-100 rounded-2xl px-5 py-4 flex gap-2 items-center shadow-soft">
                  <span className="h-1.5 w-1.5 rounded-full bg-stone-300 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-stone-300 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-1.5 w-1.5 rounded-full bg-stone-300 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── FIXED BOTTOM INPUT ── */}
      <div className="flex-none bg-white border-t border-stone-200 px-4 py-4 md:py-6 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.05)] z-20">
        <div className={clsx("max-w-4xl mx-auto transition-all duration-300", selectedPaper && "lg:mr-[42%]")}>

          {/* Status Indicator */}
          <AnimatePresence>
            {isResearchMode && (
              <motion.div
                initial={{ opacity: 0, y: 10, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: 10, height: 0 }}
                className="flex items-center justify-between mb-3 overflow-hidden"
              >
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-stone-900 text-white text-[10px] font-bold uppercase tracking-wider">
                    <Search className="h-3 w-3" />
                    Research Mode Enabled
                  </span>
                </div>
                <div className="flex gap-2 opacity-50 text-[10px] font-medium text-stone-500">
                  <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" /> ArXiv</span>
                  <span className="flex items-center gap-1"><Layers className="h-3 w-3" /> IEEE</span>
                  <span className="flex items-center gap-1"><Database className="h-3 w-3" /> Semantic Scholar</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="relative flex items-center gap-3">
            <div className="relative flex-1 group">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-stone-400 group-focus-within:text-stone-900 transition-colors" />
              <input
                className="w-full h-14 rounded-2xl border border-stone-200 bg-white pl-12 pr-4 text-base text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/5 focus:border-stone-900 shadow-soft transition-all"
                placeholder={isResearchMode ? "Search for research papers…" : "Type to chat…"}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
              />
            </div>

            {/* Toggle Switch */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-stone-50 border border-stone-200 rounded-xl">
              <span className={clsx("text-[10px] font-bold uppercase tracking-wider transition-colors", isResearchMode ? "text-stone-400" : "text-stone-900")}>Chat</span>
              <button
                onClick={() => setIsResearchMode(!isResearchMode)}
                className={clsx(
                  "relative h-6 w-11 rounded-full transition-colors duration-200 outline-none",
                  isResearchMode ? "bg-stone-900" : "bg-stone-200"
                )}
              >
                <div className={clsx(
                  "absolute top-1 left-1 h-4 w-4 rounded-full bg-white transition-transform duration-200",
                  isResearchMode && "translate-x-5"
                )} />
              </button>
              <span className={clsx("text-[10px] font-bold uppercase tracking-wider transition-colors", isResearchMode ? "text-stone-900" : "text-stone-400")}>Research</span>
            </div>

            <button
              onClick={() => handleSearch()}
              disabled={isLoading || !inputValue.trim()}
              className="h-14 w-14 shrink-0 rounded-2xl bg-stone-900 text-white flex items-center justify-center hover:bg-stone-800 disabled:opacity-40 transition-all font-semibold shadow-soft active:scale-95"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>

      {/* ── SLIDE-IN AI PANEL (Existing) ── */}
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
                isImporting ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Processing paper and extracting figures...</span>
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
      className={clsx(
        "rounded-2xl border bg-white p-5 transition-all duration-200 cursor-pointer group shadow-soft shrink-0",
        isSelected
          ? 'border-stone-400 ring-1 ring-stone-300'
          : 'border-stone-200 hover:border-stone-300 hover:shadow-card'
      )}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2 mb-3">
        <Badge variant="outline" className="text-[9px] uppercase tracking-wide px-1.5 py-0 font-bold">{paper.source}</Badge>
        <span className="text-[10px] text-stone-400">{paper.date}</span>
      </div>

      <h3 className="font-semibold text-stone-900 leading-snug mb-2 text-sm line-clamp-2">
        {paper.title}
      </h3>

      {paper.abstract && (
        <p className="text-xs text-stone-500 leading-relaxed line-clamp-3 mb-4">
          {paper.abstract}
        </p>
      )}

      <div className="flex items-center justify-between mt-auto">
        <span className="text-[10px] text-stone-400 font-medium truncate max-w-[120px]">{paper.authors}</span>
        <button
          className={clsx(
            "p-2 rounded-lg transition-all",
            isSelected ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 group-hover:bg-stone-200'
          )}
        >
          {isSelected ? <X className="h-3 w-3" /> : <ArrowRight className="h-3 w-3" />}
        </button>
      </div>
    </div>
  );
}
