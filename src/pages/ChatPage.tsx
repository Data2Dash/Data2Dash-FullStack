import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, ArrowUp, BookOpen, MessageCircle, Sparkles, User, FileText, Globe, X } from 'lucide-react';
import { clsx } from 'clsx';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { codeComponents } from '../components/ui/CodeBlock';
import { cleanTableMarkdown } from '../utils/tableUtils';
import { normalizeEquations } from '../utils/mathUtils';

interface Equation {
  label?: string;
  global_number?: number | null;
  page_number?: number | null;
  normalized_latex?: string;
  latex?: string;
  raw_text?: string;
  text?: string;
}

interface Table {
  label?: string;
  global_number?: number | null;
  page_number?: number | null;
  caption?: string;
  markdown?: string;
  raw_text?: string;
}

interface Message {
  role: 'user' | 'ai';
  content: string;
  sources?: string[];
  equations?: Equation[];
  tables?: Table[];
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ─── Equation block rendered with KaTeX via ReactMarkdown ──────────────────
function EquationBlock({ eq }: { eq: Equation }) {
  const label = eq.label ?? `Equation ${eq.global_number ?? '?'}`;
  const latex = eq.normalized_latex || eq.latex || '';
  const raw = eq.raw_text || eq.text || '';

  return (
    <div className="my-3 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
      <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1">
        📐 {label}{eq.page_number != null ? ` · Page ${eq.page_number}` : ''}
      </p>
      {latex ? (
        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
          {`$$\n${latex}\n$$`}
        </ReactMarkdown>
      ) : raw ? (
        <pre className="text-sm text-slate-700 overflow-x-auto whitespace-pre-wrap">{raw}</pre>
      ) : null}
    </div>
  );
}

// ─── Table block ───────────────────────────────────────────────────────────
function TableBlock({ tb }: { tb: Table }) {
  const label = tb.label ?? `Table ${tb.global_number ?? '?'}`;
  const caption = tb.caption ?? label;
  const md = tb.markdown ?? '';
  const raw = tb.raw_text ?? '';

  return (
    <div className="my-3 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 overflow-x-auto">
      <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide mb-2">
        📊 {label}{caption && caption !== label ? ` — ${caption}` : ''}{tb.page_number != null ? ` · Page ${tb.page_number}` : ''}
      </p>
      {md ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]} className="prose prose-sm max-w-none">
          {md}
        </ReactMarkdown>
      ) : raw ? (
        <pre className="text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap">{raw}</pre>
      ) : null}
    </div>
  );
}

export function ChatPage() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId] = useState(() => Math.random().toString(36).substring(7));
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [pdfName, setPdfName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isSearching]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    setIsSearching(true);
    const newHistory = [...messages, { role: 'user', content: `[Uploaded: ${file.name}]` } as Message];
    setMessages(newHistory);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('session_id', sessionId);

      const response = await fetch(`${API_URL}/api/pdf/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('Upload failed');

      setPdfLoaded(true);
      setPdfName(file.name);

      setMessages([...newHistory, {
        role: 'ai',
        content: `✅ **${file.name}** processed successfully!\n\nYou can now ask questions about its content, equations, and tables.`,
        equations: [],
        tables: [],
      }]);
    } catch (error) {
      console.error('Error uploading file:', error);
      setMessages([...newHistory, { role: 'ai', content: `Sorry, there was an error uploading ${file.name}.` }]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = async (e?: React.FormEvent, presetQuery?: string) => {
    e?.preventDefault();
    const textToSearch = presetQuery || query;
    if (!textToSearch.trim() || isSearching) return;

    setIsSearching(true);
    setQuery('');

    const newHistory = [...messages, { role: 'user', content: textToSearch } as Message];
    setMessages(newHistory);

    try {
      let aiMessage: Message;

      if (pdfLoaded) {
        // ── PDF mode: route to /api/pdf/chat ──────────────────────────────
        const resp = await fetch(`${API_URL}/api/pdf/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: textToSearch, session_id: sessionId }),
        });

        if (!resp.ok) throw new Error('PDF chat request failed');
        const data = await resp.json();

        // data = { answer, equations, tables, sources }
        aiMessage = {
          role: 'ai',
          content: data.answer || '',
          equations: data.equations || [],
          tables: data.tables || [],
          sources: (data.sources || []).map((s: any) =>
            typeof s === 'string' ? s : JSON.stringify(s)
          ),
        };
      } else {
        // ── General AI mode ───────────────────────────────────────────────
        const backendHistory = messages.map(msg => ({
          role: msg.role,
          content: msg.content
        }));

        const resp = await fetch(`${API_URL}/api/chat/ai`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: textToSearch,
            history: backendHistory,
            session_id: sessionId
          }),
        });

        if (!resp.ok) throw new Error('Network response was not ok');
        const data = await resp.json();

        aiMessage = {
          role: 'ai',
          content: data.response,
          sources: data.sources,
          equations: [],
          tables: [],
        };
      }

      setMessages([...newHistory, aiMessage]);
    } catch (error) {
      console.error('Error fetching chat response:', error);
      setMessages([...newHistory, {
        role: 'ai',
        content: 'Sorry, I encountered an error while processing your request. Please ensure the backend is running.'
      }]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleClearPdf = () => {
    fetch(`${API_URL}/api/pdf/clear/${sessionId}`, { method: 'DELETE' }).catch(() => {});
    setPdfLoaded(false);
    setPdfName(null);
  };

  const handlePlusClick = () => fileInputRef.current?.click();

  const renderSourceIcon = (sourceStr: string) => {
    if (sourceStr.toLowerCase().includes('arxiv')) return <FileText className="h-3 w-3 mr-1" />;
    return <Globe className="h-3 w-3 mr-1" />;
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col pt-14 relative">
      <div className="flex-1 flex flex-col items-center p-4 w-full max-w-5xl mx-auto h-[calc(100vh-3.5rem)]">

        {messages.length === 0 ? (
          <div className="flex-1 w-full flex flex-col items-center justify-center">
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center mb-10 w-full"
            >
              <div className="flex items-center justify-center gap-2.5 mb-4 group">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-900 text-white">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h1 className="text-4xl font-bold text-[#1E293B] tracking-tight">Data2Dash AI</h1>
              </div>
              <h2 className="text-lg font-semibold text-[#334155]">
                Your AI Research Assistant for Machine Learning &amp; AI Papers
              </h2>
            </motion.div>

            <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-3xl mb-8">
              <button
                onClick={() => handleSearch(undefined, "Explain what a Transformer Model is")}
                className="flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-slate-200 shadow-sm text-sm text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
              >
                <MessageCircle className="h-4 w-4 text-slate-500" />
                Explain Transformers
              </button>
              <button
                onClick={() => handleSearch(undefined, "What are the latest advancements in Retrieval Augmented Generation (RAG)?")}
                className="flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-slate-200 shadow-sm text-sm text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors"
              >
                <MessageCircle className="h-4 w-4 text-slate-500" />
                Latest in RAG
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 w-full overflow-y-auto mb-4 p-2 custom-scrollbar">
            <AnimatePresence>
              {messages.map((msg, idx) => (
                <motion.div
                  key={`msg-${idx}`}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={clsx(
                    "mb-6 flex gap-4 w-full max-w-4xl mx-auto",
                    msg.role === 'user' ? "justify-end" : "justify-start"
                  )}
                >
                  {msg.role === 'ai' && (
                    <div className="flex-shrink-0 mt-1">
                      <div className="h-8 w-8 rounded-lg bg-stone-900 flex items-center justify-center text-white">
                        <Sparkles className="h-4 w-4" />
                      </div>
                    </div>
                  )}

                  <div className={clsx(
                    "px-5 py-3.5 rounded-2xl max-w-[85%]",
                    msg.role === 'user'
                      ? "bg-slate-900 text-white rounded-tr-sm"
                      : "bg-white border border-slate-200 shadow-sm text-slate-800 rounded-tl-sm prose prose-sm max-w-none prose-slate"
                  )}>
                    {msg.role === 'ai' ? (
                      <>
                        {/* Main answer text */}
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeKatex]}
                          components={codeComponents}
                        >
                          {cleanTableMarkdown(normalizeEquations(msg.content))}
                        </ReactMarkdown>

                        {/* Equations */}
                        {msg.equations && msg.equations.length > 0 && (
                          <div className="mt-3 space-y-2 not-prose">
                            {msg.equations.map((eq, eIdx) => (
                              <EquationBlock key={eIdx} eq={eq} />
                            ))}
                          </div>
                        )}

                        {/* Tables */}
                        {msg.tables && msg.tables.length > 0 && (
                          <div className="mt-3 space-y-2 not-prose">
                            {msg.tables.map((tb, tIdx) => (
                              <TableBlock key={tIdx} tb={tb} />
                            ))}
                          </div>
                        )}

                        {/* Sources */}
                        {msg.sources && msg.sources.length > 0 && (
                          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-2 not-prose">
                            {msg.sources.map((source, sIdx) => {
                              const parts = source.split(':');
                              const type = parts[0];
                              const title = parts.slice(1).join(':').substring(0, 45) + (parts.slice(1).join(':').length > 45 ? '...' : '');
                              return (
                                <div key={sIdx} className="inline-flex items-center px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs text-slate-600 font-medium">
                                  {renderSourceIcon(type)}
                                  <span className="truncate">{title}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="whitespace-pre-wrap leading-relaxed m-0 text-[15px]">{msg.content}</p>
                    )}
                  </div>
                </motion.div>
              ))}
              {isSearching && (
                <motion.div key="loading-bubble" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.2 }} className="flex gap-4 w-full max-w-4xl mx-auto mb-6">
                  <div className="flex-shrink-0 mt-1">
                    <div className="h-8 w-8 rounded-lg bg-stone-900 flex items-center justify-center text-white">
                      <Sparkles className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200 shadow-sm px-5 py-4 rounded-2xl rounded-tl-sm flex items-center gap-2">
                    <div className="h-2 w-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="h-2 w-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="h-2 w-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </AnimatePresence>
          </div>
        )}

        {/* Active PDF banner */}
        {pdfLoaded && pdfName && (
          <div className="w-full max-w-4xl mb-2 flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-200 rounded-xl text-sm text-indigo-700">
            <FileText className="h-4 w-4 flex-shrink-0" />
            <span className="flex-1 truncate">Chatting with: <strong>{pdfName}</strong></span>
            <button
              onClick={handleClearPdf}
              title="Remove PDF"
              className="hover:text-red-500 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Floating Input Box */}
        <div className="w-full max-w-4xl shrink-0">
          <motion.div
            layout
            className="w-full bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-slate-300 p-4 transition-all focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.12)] focus-within:border-slate-400"
          >
            <form onSubmit={(e) => handleSearch(e)} className="flex flex-col h-full min-h-[140px] relative">

              <textarea
                className="w-full resize-none border-0 focus:ring-0 text-slate-700 placeholder:text-slate-400 text-base bg-transparent p-2 min-h-[80px]"
                placeholder={pdfLoaded ? `Ask a question about ${pdfName ?? 'your paper'}…` : "Ask anything about AI, ML, or upload papers/media..."}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
              />

              <div className="flex items-center justify-between mt-auto pt-2">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handlePlusClick}
                    className="flex items-center gap-2 px-4 py-2 bg-[#F1F5F9] border border-slate-200 rounded-full text-slate-600 text-sm hover:bg-slate-200 transition-colors font-medium"
                    title="Upload PDF for paper chat"
                  >
                    <BookOpen className="h-4 w-4" />
                    {pdfLoaded ? 'Change PDF' : 'Upload your source'}
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept=".pdf"
                    onChange={handleFileUpload}
                  />

                  <button
                    type="submit"
                    disabled={!query.trim() || isSearching}
                    className={clsx(
                      "h-10 w-10 rounded-full flex items-center justify-center transition-all",
                      query.trim()
                        ? "bg-slate-900 text-white hover:bg-slate-800 shadow-md"
                        : "bg-[#E2E8F0] text-white cursor-not-allowed"
                    )}
                  >
                    {isSearching ? (
                      <div className="h-4 w-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" />
                    ) : (
                      <ArrowUp className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>
            </form>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
