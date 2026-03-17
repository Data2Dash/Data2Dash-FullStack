import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, ArrowUp, BookOpen, MessageCircle, Sparkles, User, FileText, Globe } from 'lucide-react';
import { clsx } from 'clsx';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  role: 'user' | 'ai';
  content: string;
  sources?: string[];
}

export function ChatPage() {
  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId] = useState(() => Math.random().toString(36).substring(7));
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

    // Reset input so the same file could be selected again if needed
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    setIsSearching(true);
    
    // Optimistic UI for uploading
    const newHistory = [...messages, { role: 'user', content: `[User uploaded a document: ${file.name}]` } as Message];
    setMessages(newHistory);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('session_id', sessionId);
      
      const response = await fetch('http://localhost:8000/api/pdf/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      setMessages([...newHistory, {
        role: 'ai',
        content: `I've successfully received and processed **${file.name}**. You can now ask me questions about it!`,
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
      // Map frontend history to backend format if needed
      const backendHistory = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      const response = await fetch('http://localhost:8000/api/chat/ai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          query: textToSearch,
          history: backendHistory,
          session_id: sessionId
        })
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const data = await response.json();
      
      setMessages([...newHistory, { 
        role: 'ai', 
        content: data.response,
        sources: data.sources 
      }]);

    } catch (error) {
      console.error('Error fetching chat response:', error);
      setMessages([...newHistory, { role: 'ai', content: 'Sorry, I encountered an error while processing your request. Please ensure the backend is running.' }]);
    } finally {
      setIsSearching(false);
    }
  };

  const handlePlusClick = () => {
    fileInputRef.current?.click();
  };

  const renderSourceIcon = (sourceStr: string) => {
    if (sourceStr.toLowerCase().includes('arxiv')) return <FileText className="h-3 w-3 mr-1" />;
    return <Globe className="h-3 w-3 mr-1" />;
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col pt-14 relative">
      <div className="flex-1 flex flex-col items-center p-4 w-full max-w-5xl mx-auto h-[calc(100vh-3.5rem)]">
        
        {messages.length === 0 ? (
          // Empty State
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

            {/* Quick Links / Suggestions */}
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
          // Chat History View
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
                  {/* AI Avatar */}
                  {msg.role === 'ai' && (
                    <div className="flex-shrink-0 mt-1">
                      <div className="h-8 w-8 rounded-lg bg-stone-900 flex items-center justify-center text-white">
                        <Sparkles className="h-4 w-4" />
                      </div>
                    </div>
                  )}

                  {/* Message Bubble */}
                  <div className={clsx(
                    "px-5 py-3.5 rounded-2xl max-w-[85%]",
                    msg.role === 'user' 
                      ? "bg-slate-900 text-white rounded-tr-sm" 
                      : "bg-white border border-slate-200 shadow-sm text-slate-800 rounded-tl-sm prose prose-sm max-w-none prose-slate"
                  )}>
                    {msg.role === 'ai' ? (
                       <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                       </ReactMarkdown>
                    ) : (
                      <p className="whitespace-pre-wrap leading-relaxed m-0 text-[15px]">{msg.content}</p>
                    )}

                    {/* Sources (if AI) */}
                    {msg.role === 'ai' && msg.sources && msg.sources.length > 0 && (
                      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
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

        {/* Floating Input Box Wrapper */}
        <div className="w-full max-w-4xl shrink-0">
          <motion.div 
             layout
             className="w-full bg-white rounded-3xl shadow-[0_8px_30px_rgb(0,0,0,0.06)] border border-slate-300 p-4 transition-all focus-within:shadow-[0_8px_30px_rgb(0,0,0,0.12)] focus-within:border-slate-400"
          >
            <form onSubmit={(e) => handleSearch(e)} className="flex flex-col h-full min-h-[140px] relative">
              
              {/* Text Area */}
              <textarea
                className="w-full resize-none border-0 focus:ring-0 text-slate-700 placeholder:text-slate-400 text-base bg-transparent p-2 min-h-[80px]"
                placeholder="Ask anything about AI, ML, or upload papers/media..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSearch();
                  }
                }}
              />

              {/* Bottom Controls Row */}
              <div className="flex items-center justify-between mt-auto pt-2">
                
                {/* Left Action Buttons */}
                <div className="flex items-center gap-3">
                  <button 
                    type="button" 
                    onClick={handlePlusClick}
                    className="flex items-center gap-2 px-4 py-2 bg-[#F1F5F9] border border-slate-200 rounded-full text-slate-600 text-sm hover:bg-slate-200 transition-colors font-medium tooltip-trigger"
                    title="Upload Resources"
                  >
                    <BookOpen className="h-4 w-4" />
                    Upload your source
                  </button>
                </div>

                {/* Right Action Buttons */}
                <div className="flex items-center gap-3">
                  
                  {/* Hidden File Input */}
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept=".pdf, .mp3, .mp4, image/*"
                    onChange={handleFileUpload}
                  />

                  {/* Send Button */}
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
