import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, BookOpen, MessageCircle, Sparkles, FileText, Globe, X } from 'lucide-react';
import { clsx } from 'clsx';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { codeComponents } from '../components/ui/CodeBlock';
import { cleanTableMarkdown } from '../utils/tableUtils';
import { normalizeEquations } from '../utils/mathUtils';
import { useChatStore, Message } from '../store/useChatStore';
import { useAuthStore } from '../store/authStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

function EquationBlock({ eq }: { eq: any }) {
  const label = eq.label ?? `Equation ${eq.global_number ?? '?'}`;
  const latex = eq.normalized_latex || eq.latex || '';
  const raw = eq.raw_text || eq.text || '';

  return (
    <div className="my-3 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
      <p className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1">
        📐 {label}{eq.page_number != null ? ` · Page ${eq.page_number}` : ''}
      </p>
      {latex ? (
        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]} components={codeComponents}>
          {`$$\n${latex}\n$$`}
        </ReactMarkdown>
      ) : raw ? (
        <pre className="text-sm text-slate-700 overflow-x-auto whitespace-pre-wrap">{raw}</pre>
      ) : null}
    </div>
  );
}

function TableBlock({ tb }: { tb: any }) {
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
        <div className="prose prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={codeComponents}>
            {md}
          </ReactMarkdown>
        </div>
      ) : raw ? (
        <pre className="text-xs text-slate-700 overflow-x-auto whitespace-pre-wrap">{raw}</pre>
      ) : null}
    </div>
  );
}

export function ChatPage() {
  const { 
    messages, sessionId, pdfLoaded, pdfName, 
    setPdfInfo, triggerRefresh, addMessage 
  } = useChatStore();
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
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
    addMessage({ role: 'user', content: `[Uploaded: ${file.name}]` });

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('session_id', sessionId);

      const response = await fetch(`${API_URL}/api/pdf/upload`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('Upload failed');

      setPdfInfo(true, file.name);

      addMessage({
        role: 'ai',
        content: `✅ **${file.name}** processed successfully!\n\nYou can now ask questions about its content, equations, and tables.`,
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      addMessage({ role: 'ai', content: `Sorry, there was an error uploading ${file.name}.` });
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

    // Add user message to UI immediately
    addMessage({ role: 'user', content: textToSearch });

    try {
      const { token } = useAuthStore.getState();
      let aiMessage: any;

      if (pdfLoaded) {
        const resp = await fetch(`${API_URL}/api/pdf/chat`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            query: textToSearch,
            session_id: sessionId
          }),
        });

        if (!resp.ok) {
          const text = await resp.text();
          let detail = 'PDF chat request failed';
          try {
            const errData = JSON.parse(text);
            detail = errData.detail || JSON.stringify(errData);
          } catch (e) {
            detail = text || `Error ${resp.status}: ${resp.statusText}`;
          }
          throw new Error(detail);
        }
        const data = await resp.json();

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
        const backendHistory = messages.map(msg => ({
          role: msg.role,
          content: msg.content
        }));

        const resp = await fetch(`${API_URL}/api/chat/ai`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            query: textToSearch,
            history: backendHistory,
            session_id: sessionId
          }),
        });

        if (!resp.ok) {
          const text = await resp.text();
          let detail = 'Network response was not ok';
          try {
            const errData = JSON.parse(text);
            detail = errData.detail || JSON.stringify(errData);
          } catch (e) {
            detail = text || `Error ${resp.status}: ${resp.statusText}`;
          }
          throw new Error(detail);
        }
        const data = await resp.json();

        aiMessage = {
          role: 'ai',
          content: data.response,
          sources: data.sources,
        };
      }

      setIsSearching(false);
      addMessage(aiMessage);
      
      // Refresh sidebar to show the new/updated session
      triggerRefresh();
    } catch (error: any) {
      console.error('Error fetching chat response:', error);
      setIsSearching(false);
      addMessage({
        role: 'ai',
        content: `Error: ${error.message || 'I encountered an error while processing your request.'}`
      });
    }
  };

  const handleClearPdf = () => {
    fetch(`${API_URL}/api/pdf/clear/${sessionId}`, { method: 'DELETE' }).catch(() => {});
    setPdfInfo(false, null);
  };

  const renderSourceIcon = (sourceStr: string) => {
    if (sourceStr.toLowerCase().includes('arxiv')) return <FileText className="h-3 w-3 mr-1" />;
    return <Globe className="h-3 w-3 mr-1" />;
  };

  return (
    <div className="h-full bg-[#F8FAFC] flex flex-col relative overflow-hidden">
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto custom-scrollbar p-4 w-full flex flex-col items-center"
      >
        <div className="w-full max-w-4xl flex flex-col min-h-full">
          {messages.length === 0 ? (
            <div className="flex-1 w-full flex flex-col items-center justify-center py-12">
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center mb-10 w-full"
              >
                <div className="flex items-center justify-center gap-2.5 mb-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-900 text-white shadow-soft">
                    <Sparkles className="h-7 w-7" />
                  </div>
                  <h1 className="text-4xl font-extrabold text-[#1E293B] tracking-tight">Data2Dash AI</h1>
                </div>
                <h2 className="text-lg font-semibold text-[#64748B] max-w-md mx-auto">
                  Research assistant for machine learning and academic literature.
                </h2>
              </motion.div>

              <div className="flex flex-wrap items-center justify-center gap-3 w-full max-w-3xl mb-8">
                {[
                  "Explain Transformer Models",
                  "Latest advancements in RAG",
                  "What is Prompt Engineering?"
                ].map((text, i) => (
                  <button
                    key={i}
                    onClick={() => handleSearch(undefined, text)}
                    className="flex items-center gap-2 px-5 py-2.5 bg-white rounded-2xl border border-slate-200 shadow-sm text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-all active:scale-95"
                  >
                    <MessageCircle className="h-4 w-4 text-slate-400" />
                    {text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-8 w-full">
              <AnimatePresence initial={false}>
                {messages.map((msg, idx) => (
                  <motion.div
                    key={`msg-${idx}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={clsx(
                      "mb-8 flex gap-4 w-full",
                      msg.role === 'user' ? "justify-end" : "justify-start"
                    )}
                  >
                    {msg.role === 'ai' && (
                      <div className="flex-shrink-0 mt-1">
                        <div className="h-9 w-9 rounded-xl bg-stone-900 flex items-center justify-center text-white shadow-soft">
                          <Sparkles className="h-5 w-5" />
                        </div>
                      </div>
                    )}

                    <div className={clsx(
                      "px-6 py-4 rounded-2xl max-w-[85%] shadow-sm transition-shadow hover:shadow-md",
                      msg.role === 'user'
                        ? "bg-slate-900 text-white rounded-tr-sm font-medium"
                        : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm prose prose-slate max-w-none prose-sm"
                    )}>
                      {msg.role === 'ai' ? (
                        <>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                            components={codeComponents}
                          >
                            {cleanTableMarkdown(normalizeEquations(msg.content))}
                          </ReactMarkdown>

                          {msg.equations && msg.equations.length > 0 && (
                            <div className="mt-4 space-y-3 not-prose">
                              {msg.equations.map((eq: any, eIdx: number) => (
                                <EquationBlock key={eIdx} eq={eq} />
                              ))}
                            </div>
                          )}

                          {msg.tables && msg.tables.length > 0 && (
                            <div className="mt-4 space-y-3 not-prose">
                              {msg.tables.map((tb: any, tIdx: number) => (
                                <TableBlock key={tIdx} tb={tb} />
                              ))}
                            </div>
                          )}

                          {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap gap-2 not-prose">
                              {msg.sources.map((source: string, sIdx: number) => {
                                const parts = source.split(':');
                                const type = parts[0];
                                const title = parts.slice(1).join(':').substring(0, 50) + (parts.slice(1).join(':').length > 50 ? '...' : '');
                                return (
                                  <div key={sIdx} className="inline-flex items-center px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 font-bold transition-colors hover:bg-slate-100">
                                    {renderSourceIcon(type)}
                                    <span className="truncate">{title}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      ) : (
                        <p className="whitespace-pre-wrap leading-relaxed m-0">{msg.content}</p>
                      )}
                    </div>
                  </motion.div>
                ))}
                {isSearching && (
                  <motion.div
                    key="loading-dots"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, transition: { duration: 0 } }}
                    className="flex gap-4 w-full mb-8"
                  >
                    <div className="h-9 w-9 rounded-xl bg-stone-900 flex items-center justify-center text-white shadow-soft">
                      <Sparkles className="h-5 w-5" />
                    </div>
                    <div className="bg-white border border-slate-200 shadow-sm px-6 py-4 rounded-2xl rounded-tl-sm flex items-center gap-2">
                      <div className="h-2 w-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="h-2 w-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="h-2 w-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </motion.div>
                )}
                <div ref={messagesEndRef} className="h-4" />
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Input Section */}
      <div className="w-full bg-white border-t border-slate-200 p-4 shrink-0 flex flex-col items-center">
        {pdfLoaded && pdfName && (
          <div className="w-full max-w-4xl mb-3 flex items-center gap-3 px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-2xl text-sm text-indigo-700 animate-in fade-in slide-in-from-bottom-2">
            <FileText className="h-4 w-4" />
            <span className="flex-1 truncate font-semibold">Active Paper: {pdfName}</span>
            <button onClick={handleClearPdf} className="p-1 hover:bg-indigo-100 rounded-full transition-colors"><X className="h-4 w-4" /></button>
          </div>
        )}

        <div className="w-full max-w-4xl relative">
          <form onSubmit={(e) => handleSearch(e)} className="relative group">
            <textarea
              className="w-full resize-none border border-slate-200 focus:border-slate-400 focus:ring-0 rounded-3xl p-4 pr-16 min-h-[60px] max-h-[200px] text-slate-700 placeholder:text-slate-400 shadow-sm transition-all focus:shadow-md"
              placeholder={pdfLoaded ? "Ask about the paper..." : "Ask Data2Dash AI anything..."}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSearch();
                }
              }}
              rows={1}
            />
            <div className="absolute right-2 bottom-2 flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="h-10 w-10 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-all"
                title="Upload Source"
              >
                <BookOpen className="h-5 w-5" />
              </button>
              <button
                type="submit"
                disabled={!query.trim() || isSearching}
                className={clsx(
                  "h-10 w-10 rounded-full flex items-center justify-center transition-all shadow-sm",
                  query.trim() && !isSearching ? "bg-stone-900 text-white hover:bg-stone-800 active:scale-95" : "bg-slate-100 text-slate-300"
                )}
              >
                {isSearching ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ArrowUp className="h-5 w-5" />}
              </button>
            </div>
            <input type="file" ref={fileInputRef} className="hidden" accept=".pdf" onChange={handleFileUpload} />
          </form>
          <p className="text-[10px] text-center text-slate-400 mt-2 font-medium">Data2Dash can make mistakes. Verify important information.</p>
        </div>
      </div>
    </div>
  );
}
