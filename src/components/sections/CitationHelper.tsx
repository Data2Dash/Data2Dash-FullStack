import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Quote, Copy, Check, Sparkles, Trash2, Download, FileText, 
  ExternalLink, X, Clock, Copy as CopyIcon, 
  Bold, Italic, Underline, Strikethrough, Link as LinkIcon, 
  List, Code, ChevronDown, Monitor, Search, Share2, Library, Home, User
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';
import { searchCitations, formatCitation, citationToText, CitationPaper, CitationFormatResponse } from '../../api/citationApi';

const INITIAL_CONTENT = `In recent years, the integration of advanced natural language processing has profoundly
transformed information retrieval. The attention mechanism provides a powerful framework
for contextual understanding. This has enabled new methodologies in extracting insights
from unstructured academic literature. Future developments are likely to focus on efficient
long-context processing.`;

interface Citation extends CitationFormatResponse {
  id: string;
}

type CitationStyle = 'apa' | 'mla' | 'chicago' | 'bibtex';

export function CitationHelper() {
  const [citations, setCitations] = useState<Citation[]>([]);
  const [selectedText, setSelectedText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<CitationPaper[]>([]);
  const [savedRange, setSavedRange] = useState<Range | null>(null);
  const [searchBoxPos, setSearchBoxPos] = useState<{ top: number; left: number } | null>(null);
  
  const [activeStyle, setActiveStyle] = useState<CitationStyle>('apa');
  const [isFormatting, setIsFormatting] = useState<string | null>(null);
  const [articleTitle, setArticleTitle] = useState('My article');
  const [error, setError] = useState<string | null>(null);
  
  const editorRef = useRef<HTMLDivElement>(null);

  // Word & Character counts
  const [counts, setCounts] = useState({ words: 0, chars: 0 });

  const updateCounts = useCallback(() => {
    if (!editorRef.current) return;
    const text = editorRef.current.innerText || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    setCounts({ words, chars: text.length });
  }, []);

  const clearMarkers = () => {
    if (!editorRef.current) return;
    const markers = editorRef.current.querySelectorAll('.cite-marker');
    markers.forEach(m => m.remove());
  };

  useEffect(() => {
    updateCounts();
  }, [updateCounts]);

  const handleTextSelect = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0 && editorRef.current?.contains(selection.anchorNode)) {
      const text = selection.toString().trim();
      setSelectedText(text);
      
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      
      // Position the search box
      setSearchBoxPos({
        top: rect.bottom + window.scrollY + 10,
        left: Math.min(rect.left + window.scrollX, window.innerWidth - 450)
      });
      
      // 1. CLEAR existing markers
      clearMarkers();
      
      // 2. INSERT a fresh marker at the selection point
      const marker = document.createElement('span');
      marker.className = 'cite-marker h-0 w-0 pointer-events-none opacity-0';
      marker.id = 'active-cite-marker';
      
      const markerRange = range.cloneRange();
      markerRange.collapse(false); // End of selection
      markerRange.insertNode(marker);
      
      setSavedRange(range.cloneRange());
    }
  };

  const initSearch = async () => {
    if (!selectedText) return;
    setIsSearching(true);
    setSearchResults([]);
    
    try {
      const results = await searchCitations(selectedText);
      setSearchResults(results);
    } catch (e) {
      console.error(e);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  useEffect(() => {
    if (selectedText && searchBoxPos) {
      initSearch();
    }
  }, [selectedText]);

  const handleCitePaper = async (paper: CitationPaper) => {
    setIsFormatting(paper.id);
    setError(null);

    let marker = document.getElementById('active-cite-marker');
    
    // Fallback if marker was lost but we still have a range
    if (!marker && savedRange && editorRef.current) {
       console.log('Marker lost, using savedRange fallback');
       marker = document.createElement('span');
       marker.id = 'active-cite-marker';
       marker.className = 'cite-marker';
       try {
         const selection = window.getSelection();
         if (selection) {
           selection.removeAllRanges();
           selection.addRange(savedRange);
           savedRange.collapse(false);
           savedRange.insertNode(marker);
         }
       } catch (err) {
         console.error('Fallback failed:', err);
       }
    }

    if (!marker) {
      setError('Loss of selection. Please re-highlight the text.');
      setIsFormatting(null);
      setSearchBoxPos(null);
      return;
    }

    const authorDisplay = paper.authors && paper.authors.length > 0 
      ? (paper.authors[0].split(' ').pop() || 'Unknown') 
      : 'Unknown';
    const inlineText = ` (${authorDisplay} et al., ${paper.year})`;

    // 1. REPLACE marker with citation immediately
    marker.textContent = inlineText;
    marker.className = 'text-sage-600 font-medium whitespace-nowrap';
    marker.id = ''; // Remove special ID

    try {
      // 2. ASYNC ACTION: Bibliography update
      const formatted = await formatCitation(paper);
      const id = Math.random().toString(36).substr(2, 9);
      
      const newCitation: Citation = {
        id,
        ...formatted
      };
      
      setCitations(prev => [...prev, newCitation]);
      setSelectedText('');
      setSearchBoxPos(null);
      setSavedRange(null);
      updateCounts();
    } catch (e) {
      console.error('Bibliography update error:', e);
      setError('Citation added, but references list at bottom failed to update.');
    } finally {
      setIsFormatting(null);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900 flex font-sans selection:bg-sage-100 selection:text-sage-900">
      {/* ── Left Sidebar ── */}
      <aside className="w-64 border-r border-stone-200 flex flex-col p-4 shrink-0 hidden lg:flex bg-white">
        <div className="flex items-center gap-3 mb-8 px-2">
          <div className="h-8 w-8 bg-stone-900 rounded-lg flex items-center justify-center text-white font-bold text-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          <span className="font-semibold text-sm tracking-tight text-stone-900">
            DATA<span className="text-sage-600">2</span>DASH
          </span>
        </div>
        
        <nav className="space-y-1">
          {[
            { icon: Home, label: 'Home', path: '/' },
            { icon: Search, label: 'Search', path: '/search' },
            { icon: Library, label: 'Library', path: '/upload' },
            { icon: Sparkles, label: 'Agent', path: '/' }
          ].map((item) => (
            <Link 
              key={item.label} 
              to={item.path}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-stone-600 hover:text-stone-900 hover:bg-stone-50 transition-all text-sm font-medium"
            >
              <item.icon className="h-4 w-4" /> {item.label}
            </Link>
          ))}
        </nav>

        <div className="mt-8">
          <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Workspace</p>
          <div className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-stone-900 bg-stone-100/80 text-sm font-semibold">
            <FileText className="h-4 w-4 text-stone-400" /> Current Manuscript
          </div>
        </div>

        <div className="mt-auto pt-4 space-y-2">
          <button className="flex items-center gap-2 text-stone-400 hover:text-stone-900 text-xs px-2"><Share2 className="h-4 w-4" /> Community</button>
          <button className="flex items-center gap-2 text-stone-400 hover:text-stone-900 text-xs px-2"><User className="h-4 w-4" /> Support</button>
        </div>
      </aside>

      {/* ── Main Editor ── */}
      <main className="flex-1 flex flex-col relative overflow-hidden bg-stone-50/50">
        {/* Header toolbar */}
        <header className="h-14 border-b border-stone-200 flex items-center justify-between px-6 bg-white/80 backdrop-blur-md z-30">
          <div className="flex items-center gap-4">
             <button className="text-stone-400 hover:text-stone-900"><List className="h-5 w-5" /></button>
             <h2 className="text-sm font-medium text-stone-600 uppercase tracking-widest">{articleTitle}</h2>
          </div>
          <div className="flex items-center gap-3">
             <button className="p-2 text-stone-400 hover:text-stone-900"><Monitor className="h-4 w-4" /></button>
          </div>
        </header>

        {/* Editor Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-12 bg-dot-pattern">
          <div className="max-w-3xl mx-auto flex flex-col min-h-full bg-white p-12 md:p-16 rounded-[2.5rem] shadow-card border border-stone-100">
            <input 
              value={articleTitle}
              onChange={(e) => setArticleTitle(e.target.value)}
              className="text-5xl font-extrabold bg-transparent border-none outline-none text-stone-900 mb-8 placeholder:text-stone-200"
              placeholder="Article title..."
            />
            
            {/* Error Message */}
            {error && (
              <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] bg-red-50 text-red-600 px-4 py-2 rounded-lg border border-red-100 shadow-lg text-sm font-medium flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
                <X className="h-4 w-4" /> {error}
              </div>
            )}

            <div
              ref={editorRef}
              contentEditable
              onMouseUp={handleTextSelect}
              onKeyUp={updateCounts}
              onInput={updateCounts}
              className="flex-1 text-xl leading-[1.8] text-stone-800 outline-none font-serif min-h-[400px] selection:bg-sage-100 selection:text-sage-900"
              suppressContentEditableWarning
              dangerouslySetInnerHTML={{ __html: INITIAL_CONTENT }}
            />

            {/* References Section */}
            {citations.length > 0 && (
              <div className="mt-20 pt-12 border-t border-stone-100 pb-10">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-lg font-bold text-stone-900">References</h3>
                  <button className="text-xs text-stone-400 hover:text-sage-600 transition-colors flex items-center gap-1 font-medium">
                    Change format in settings <CopyIcon className="h-3 w-3" />
                  </button>
                </div>
                <div className="space-y-6">
                  {citations.map((cite) => (
                    <div key={cite.id} className="text-sm text-stone-600 leading-relaxed font-serif pl-6 -indent-6">
                      {citationToText(cite[activeStyle])}
                      {cite.source && (
                        <a href={cite.source} target="_blank" rel="noreferrer" className="block text-sage-600/70 hover:text-sage-700 underline mt-1 break-all">
                          {cite.source}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Floating Bottom Toolbar */}
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-40">
           <div className="bg-white/90 backdrop-blur-xl border border-stone-200 rounded-2xl shadow-panel p-2 flex items-center gap-1">
              <div className="px-3 border-r border-stone-100 flex items-center gap-2">
                 <div className="h-2 w-2 rounded-full bg-sage-500"></div>
                 <span className="text-xs font-semibold text-stone-700">Regular text</span>
                 <ChevronDown className="h-3 w-3 text-stone-400" />
              </div>
              <div className="flex items-center gap-0.5 px-2">
                 <button className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-50 rounded-lg transition-all"><Bold className="h-4 w-4" /></button>
                 <button className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-50 rounded-lg transition-all"><Italic className="h-4 w-4" /></button>
                 <button className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-50 rounded-lg transition-all"><Underline className="h-4 w-4" /></button>
                 <button className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-50 rounded-lg transition-all"><Strikethrough className="h-4 w-4" /></button>
                 <button className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-50 rounded-lg transition-all"><LinkIcon className="h-4 w-4" /></button>
                 <div className="w-[1px] h-4 bg-stone-100 mx-1"></div>
                 <button className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-50 rounded-lg transition-all"><List className="h-4 w-4" /></button>
                 <button className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-50 rounded-lg transition-all"><Quote className="h-4 w-4" /></button>
                 <button className="p-2 text-stone-500 hover:text-stone-900 hover:bg-stone-50 rounded-lg transition-all"><Code className="h-4 w-4" /></button>
              </div>
           </div>
        </div>

        {/* Inline Citation Card */}
        {searchBoxPos && selectedText && (
          <div 
            className="absolute z-50 w-[450px] bg-white/95 backdrop-blur-xl border border-stone-200 rounded-2xl shadow-panel overflow-hidden animate-in fade-in slide-in-from-bottom-2 duration-200"
            style={{ 
              top: `${searchBoxPos.top}px`, 
              left: `${searchBoxPos.left}px` 
            }}
          >
            <div className="p-4 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
              <span className="text-[10px] font-bold text-stone-600 uppercase tracking-widest flex items-center gap-2">
                <Search className="h-3 w-3 text-sage-600" /> Find citations
              </span>
              <div className="flex items-center gap-2">
                 <span className="text-[9px] font-bold text-stone-500 px-1.5 py-0.5 bg-white rounded border border-stone-100 uppercase">online</span>
                 <span className="text-[9px] font-bold text-stone-500 px-1.5 py-0.5 bg-white rounded border border-stone-100 uppercase">relevance</span>
                 <button onClick={() => setSearchBoxPos(null)} className="text-stone-300 hover:text-stone-600 ml-2 transition-colors"><X className="h-4 w-4" /></button>
              </div>
            </div>
            
            <div className="p-4 max-h-[400px] overflow-y-auto custom-scrollbar">
              <div className="relative mb-6">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
                 <input 
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl py-2 pl-10 pr-4 text-sm text-stone-900 focus:ring-1 focus:ring-sage-200 focus:border-sage-400 outline-none transition-all font-medium"
                    value={selectedText}
                    readOnly
                 />
              </div>

              {isSearching ? (
                <div className="flex flex-col items-center justify-center py-12">
                   <Sparkles className="h-6 w-6 text-sage-500 animate-pulse mb-3" />
                   <p className="text-xs text-stone-400 font-medium">Searching academic databases...</p>
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-6">
                  {searchResults.map((paper, idx) => (
                    <div key={idx} className="group flex flex-col gap-3">
                       <div>
                          <h4 className="text-sm font-bold text-stone-900 leading-snug group-hover:text-sage-700 transition-colors">{paper.title}</h4>
                          <p className="text-xs text-stone-500 mt-1 font-medium">{paper.authors.join(', ')}</p>
                       </div>
                       
                       <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <span className="text-[11px] font-semibold text-stone-400">{paper.year}</span>
                          <span className="text-[11px] font-semibold text-stone-400">• 1 citations</span>
                          {paper.url && <a href={paper.url} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-sage-600 hover:text-sage-800 underline">PDF ↗</a>}
                          {paper.doi && <a href={`https://doi.org/${paper.doi}`} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-sage-600 hover:text-sage-800 underline">DOI ↗</a>}
                          
                          <div className="ml-auto flex gap-2">
                             <button className="px-3 py-1 text-[11px] font-bold text-stone-500 hover:text-stone-900 transition-colors">Add to library</button>
                             <button 
                               onMouseDown={(e) => {
                                 e.preventDefault(); // CRITICAL: Prevents focus from leaving the editor
                                 handleCitePaper(paper);
                               }}
                               disabled={isFormatting === paper.id}
                               className="px-4 py-1.5 bg-stone-900 text-white text-[11px] font-bold rounded-full hover:bg-stone-800 transition-all active:scale-[0.98] disabled:opacity-50 shadow-soft"
                             >
                               {isFormatting === paper.id ? '...' : 'Cite'}
                             </button>
                          </div>
                       </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-xs text-stone-400 font-medium">No matching articles found.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── Right Sidebar ── */}
      <aside className="w-68 border-l border-stone-200 flex flex-col shrink-0 hidden xl:flex bg-white">
         <div className="p-4 border-b border-stone-100 flex items-center justify-between">
            <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Statistics</span>
            <FileText className="h-4 w-4 text-stone-300" />
         </div>
         
         <div className="p-5 space-y-4">
            <div className="flex justify-between items-center text-xs">
               <span className="text-stone-400 font-medium">Word count</span>
               <span className="text-stone-900 font-bold">{counts.words}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
               <span className="text-stone-400 font-medium">Character count</span>
               <span className="text-stone-900 font-bold">{counts.chars}</span>
            </div>
         </div>
      </aside>
    </div>
  );
}
