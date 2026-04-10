import React, { useState, useRef, useEffect } from 'react';
import { Quote, Copy, Check, Sparkles, Trash2, Download, FileText, PenTool, ExternalLink, X } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { searchCitations, formatCitation, CitationPaper, CitationFormatResponse } from '../../api/citationApi';

interface Citation extends CitationFormatResponse {
  id: string;
}

type CitationStyle = 'apa' | 'mla' | 'chicago' | 'bibtex';

export function CitationHelper() {
  const [citations, setCitations] = useState<Citation[]>([]);
  const [selectedText, setSelectedText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const [showModal, setShowModal] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<CitationPaper[]>([]);
  const [savedRange, setSavedRange] = useState<Range | null>(null);
  
  const [activeStyle, setActiveStyle] = useState<CitationStyle>('apa');
  const [isFormatting, setIsFormatting] = useState<string | null>(null); // holds the paper id currently formatting
  
  const editorRef = useRef<HTMLDivElement>(null);

  const handleTextSelect = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0 && editorRef.current?.contains(selection.anchorNode)) {
      setSelectedText(selection.toString());
    } else {
      setSelectedText('');
    }
  };

  const initSearch = async () => {
    if (!selectedText) return;
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      setSavedRange(selection.getRangeAt(0).cloneRange());
    }
    
    setShowModal(true);
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

  const handleCitePaper = async (paper: CitationPaper) => {
    setIsFormatting(paper.id);
    try {
      const formatted = await formatCitation(paper);
      const id = Math.random().toString(36).substr(2, 9);
      
      const newCitation: Citation = {
        id,
        ...formatted
      };

      // Restore selection range and inject citation
      if (savedRange) {
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(savedRange);
        
        const span = document.createElement('span');
        span.className = 'text-indigo-600 font-semibold cursor-pointer bg-indigo-50 px-1 py-0.5 rounded mx-0.5 border border-indigo-200';
        // Basic Author Year approximation from metadata for inline display
        const authorDisplay = paper.authors.length > 0 ? paper.authors[0].split(' ').pop() : 'Unknown';
        span.textContent = `(${authorDisplay}, ${paper.year})`;
        span.onclick = (e) => {
          e.stopPropagation();
          document.getElementById(`citation-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
        
        savedRange.deleteContents();
        savedRange.insertNode(span);
        selection?.removeAllRanges();
      }
      
      setCitations(prev => [newCitation, ...prev]);
      setShowModal(false);
      setSelectedText('');
      setSavedRange(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsFormatting(null);
    }
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownload = (format: CitationStyle) => {
    const content = citations.map((c) => c[format]).join('\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `references.${format === 'bibtex' ? 'bib' : 'txt'}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-50 pt-14 flex flex-col relative">
      <div className="flex-1 flex flex-col max-w-7xl mx-auto w-full px-6 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2">Academic Document Writer</h1>
          <p className="text-slate-500 max-w-xl mx-auto">Write your document and highlight sentences to automatically search Semantic Scholar and instantly inject proper citations.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
          {/* ── Manuscript Editor ── */}
          <div className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <PenTool className="h-4 w-4 text-slate-400" />
                <span className="text-sm font-semibold text-slate-800">Manuscript</span>
              </div>
              <Badge variant={selectedText ? 'default' : 'secondary'} className="transition-all rounded-full px-3 py-1 text-xs">
                {selectedText ? 'Ready to cite' : 'Select text to cite'}
              </Badge>
            </div>

            <div className="relative flex-1 bg-white">
              <div
                ref={editorRef}
                contentEditable
                onMouseUp={handleTextSelect}
                onTouchEnd={handleTextSelect}
                className="h-full min-h-[500px] w-full overflow-y-auto px-10 py-8 text-base leading-relaxed text-slate-800 focus:outline-none font-serif"
                suppressContentEditableWarning
              >
                In recent years, the integration of advanced natural language processing has profoundly
                transformed information retrieval. The attention mechanism provides a powerful framework
                for contextual understanding. This has enabled new methodologies in extracting insights
                from unstructured academic literature. Future developments are likely to focus on efficient
                long-context processing.
              </div>

              {selectedText && (
                <div className="absolute bottom-6 right-6 z-10 animate-in fade-in slide-in-from-bottom-3 duration-200">
                  <button
                    onClick={initSearch}
                    className="flex items-center gap-2 px-5 py-3 rounded-full bg-indigo-600 text-white text-sm font-medium shadow-lg hover:bg-indigo-700 hover:shadow-xl transition-all"
                  >
                    <Quote className="h-4 w-4" /> Search Citations
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Reference List ── */}
          <div className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50 flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 text-slate-400" />
                <span className="text-sm font-semibold text-slate-800">
                  Bibliography ({citations.length})
                </span>
                
                {citations.length > 0 && (
                  <select 
                    value={activeStyle}
                    onChange={(e) => setActiveStyle(e.target.value as CitationStyle)}
                    className="text-xs bg-white border border-slate-200 rounded px-2 py-1 ml-2 text-slate-600 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value="apa">APA 7th</option>
                    <option value="mla">MLA 9th</option>
                    <option value="chicago">Chicago</option>
                    <option value="bibtex">BibTeX</option>
                  </select>
                )}
              </div>
              {citations.length > 0 && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleDownload(activeStyle)}>
                    <Download className="h-3 w-3 mr-1.5" /> Export
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setCitations([])} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                    Clear
                  </Button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/50 min-h-[500px]">
              {citations.length > 0 ? (
                <div className="space-y-4">
                  {citations.map((citation) => (
                    <div
                      key={citation.id}
                      id={`citation-${citation.id}`}
                      className="group relative rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow transition-all"
                    >
                      <button
                        onClick={() => setCitations(prev => prev.filter(c => c.id !== citation.id))}
                        className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all p-1.5 rounded-md hover:bg-slate-100"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>

                      <div className="pr-8 space-y-3">
                        <div className="flex items-start justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">
                            {activeStyle.toUpperCase()}
                          </span>
                          <button onClick={() => handleCopy(citation[activeStyle], `${citation.id}-copy`)} className="text-slate-400 hover:text-slate-700 transition-colors">
                            {copiedId === `${citation.id}-copy` ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                          </button>
                        </div>
                        
                        {activeStyle === 'bibtex' ? (
                          <pre className="overflow-x-auto text-xs text-slate-600 font-mono leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                            {citation.bibtex}
                          </pre>
                        ) : (
                          <p className="text-sm text-slate-800 leading-relaxed font-serif pl-4 -indent-4">
                            {citation[activeStyle]}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 py-16 text-center">
                  <div className="h-16 w-16 mb-4 rounded-full bg-slate-100 flex items-center justify-center">
                    <Quote className="h-7 w-7 text-slate-300" />
                  </div>
                  <h3 className="text-lg font-medium text-slate-800 mb-1">Your bibliography is empty</h3>
                  <p className="text-sm text-slate-500 max-w-xs">Highlight text in your document and search to accurately cite references here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Semantic Scholar Search Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-bold text-slate-900 flex items-center gap-2">
                  <Quote className="h-4 w-4 text-indigo-600" /> Source Search
                </h3>
                <p className="text-xs text-slate-500 mt-1">Results indexed via AI analysis & Semantic Scholar</p>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 p-2 rounded-full hover:bg-slate-200 transition-colors">
                <X className="h-5 w-5" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
              {isSearching ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Sparkles className="h-8 w-8 text-indigo-500 animate-spin mb-4" />
                  <p className="text-sm font-medium text-slate-600">Analyzing context & querying databases...</p>
                </div>
              ) : searchResults.length > 0 ? (
                <div className="space-y-4">
                  {searchResults.map((paper, idx) => (
                    <div key={idx} className="bg-white border text-left border-slate-200 rounded-xl p-5 hover:border-indigo-300 transition-colors shadow-sm flex flex-col sm:flex-row gap-4 justify-between items-start">
                      <div className="flex-1">
                        <h4 className="font-semibold text-slate-900 leading-snug mb-1">{paper.title}</h4>
                        <p className="text-sm text-slate-600 mb-2">
                          {paper.authors.length > 0 ? paper.authors.join(', ') : 'Unknown Author'} · {paper.year}
                        </p>
                        
                        {(paper.url || paper.doi) && (
                          <a 
                            href={paper.url || `https://doi.org/${paper.doi}`} 
                            target="_blank" 
                            rel="noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-indigo-600 font-medium hover:text-indigo-800 bg-indigo-50 px-2.5 py-1 rounded-md transition-colors"
                          >
                            <ExternalLink className="h-3 w-3" /> View Source {paper.doi && `(DOI: ${paper.doi})`}
                          </a>
                        )}
                      </div>
                      
                      <div className="w-full sm:w-auto shrink-0 flex items-center justify-end">
                        <Button 
                          onClick={() => handleCitePaper(paper)}
                          disabled={isFormatting === paper.id}
                          className="w-full sm:w-auto rounded-full shadow-sm"
                        >
                          {isFormatting === paper.id ? (
                            <><Sparkles className="h-4 w-4 animate-spin mr-2" /> Formatting</>
                          ) : (
                            'Cite this'
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <p className="text-slate-500">No matching articles found. Try highlighting a more distinct sentence.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
