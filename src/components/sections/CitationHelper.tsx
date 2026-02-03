import React, { useState, useRef } from 'react';
import { Quote, Copy, Check, Sparkles, Trash2, Download, FileText, PenTool } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';

interface Citation {
  id: string;
  source: string;
  apa: string;
  bibtex: string;
  mla: string;
}

export function CitationHelper() {
  const [citations, setCitations] = useState<Citation[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  const handleTextSelect = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0 && editorRef.current?.contains(selection.anchorNode)) {
      setSelectedText(selection.toString());
    } else {
      setSelectedText('');
    }
  };

  const handleGenerate = () => {
    if (!selectedText) return;

    setIsGenerating(true);
    
    // Simulate AI search delay
    setTimeout(() => {
      const id = Math.random().toString(36).substr(2, 9);
      const newCitation: Citation = {
        id,
        source: selectedText.length > 20 ? selectedText.substring(0, 20) + "..." : selectedText,
        apa: "Smith, J. (2023). Artificial Intelligence in Academic Research. Journal of Future Technology, 12(3), 45-67.",
        bibtex: `@article{smith2023ai,\n  title={Artificial Intelligence in Academic Research},\n  author={Smith, John},\n  journal={Journal of Future Technology},\n  year={2023}\n}`,
        mla: "Smith, John. \"Artificial Intelligence in Academic Research.\" Journal of Future Technology 12.3 (2023): 45-67."
      };
      
      // Replace text with citation link
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const span = document.createElement('span');
        span.className = 'text-indigo-600 font-bold cursor-pointer hover:underline bg-indigo-50 px-1.5 py-0.5 rounded mx-1 border border-indigo-200 transition-colors hover:bg-indigo-100';
        span.textContent = `(Smith, 2023)`;
        span.title = "Click to view source";
        span.dataset.citationId = id;
        span.onclick = (e) => {
          e.stopPropagation();
          const element = document.getElementById(`citation-${id}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.classList.add('ring-2', 'ring-indigo-500', 'bg-indigo-50');
            setTimeout(() => element.classList.remove('ring-2', 'ring-indigo-500', 'bg-indigo-50'), 2000);
          }
        };
        
        range.deleteContents();
        range.insertNode(span);
        
        // Clear selection
        selection.removeAllRanges();
      }

      setCitations(prev => [newCitation, ...prev]);
      setIsGenerating(false);
      setSelectedText('');
    }, 1500);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = (id: string) => {
    setCitations(prev => prev.filter(c => c.id !== id));
  };

  const handleDownload = (format: 'apa' | 'bibtex' | 'mla') => {
    const content = citations.map(c => c[format]).join('\n\n');
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
    <section className="bg-slate-50 py-20 min-h-screen bg-[conic-gradient(at_top_left,_var(--tw-gradient-stops))] from-slate-100 via-slate-50 to-indigo-50" id="citation">
      <div className="container mx-auto px-4">
        <div className="mb-12 text-center">
          <Badge variant="secondary" className="mb-4 bg-white shadow-sm border-slate-200">Section 3</Badge>
          <h2 className="mb-4 text-4xl font-bold text-slate-900 tracking-tight">Smart Citation Helper</h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">Highlight text in your manuscript to automatically generate citations.</p>
        </div>

        <div className="mx-auto max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-2 h-[700px]">
            {/* Input Area */}
            <Card className="flex flex-col overflow-hidden border-slate-200 shadow-xl bg-white/80 backdrop-blur-sm h-full rounded-3xl">
              <div className="border-b border-slate-100 p-5 bg-white/50 flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <PenTool className="h-4 w-4 text-indigo-500" />
                  <label className="text-sm font-bold text-slate-700">Manuscript Text</label>
                </div>
                <Badge variant={selectedText ? "default" : "secondary"} className="transition-all duration-300">
                  {selectedText ? "Text Selected" : "Select text to cite"}
                </Badge>
              </div>
              <div className="flex-1 p-0 relative bg-white/50">
                <div 
                  ref={editorRef}
                  contentEditable
                  onMouseUp={handleTextSelect}
                  onTouchEnd={handleTextSelect}
                  className="h-full w-full overflow-y-auto p-8 text-lg leading-relaxed text-slate-700 focus:outline-none font-serif"
                  suppressContentEditableWarning
                >
                  As discussed by Smith (2023), the integration of AI in research workflows has significantly improved efficiency. However, concerns regarding data privacy remain prevalent.
                </div>
                
                {/* Floating Action Button for Selection */}
                {selectedText && (
                  <div className="absolute bottom-8 right-8 animate-in fade-in zoom-in duration-300 z-10">
                    <Button 
                      onClick={handleGenerate} 
                      disabled={isGenerating}
                      className="shadow-2xl h-12 px-6 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white border-2 border-white/20"
                    >
                      {isGenerating ? (
                        <>
                          <Sparkles className="mr-2 h-5 w-5 animate-spin" />
                          Searching...
                        </>
                      ) : (
                        <>
                          <Quote className="mr-2 h-5 w-5" />
                          Generate Citation
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </Card>

            {/* Results Area */}
            <Card className="flex flex-col overflow-hidden border-slate-200 shadow-xl bg-white/80 backdrop-blur-sm h-full rounded-3xl">
              <div className="border-b border-slate-100 p-5 bg-white/50 flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-indigo-500" />
                  <label className="text-sm font-bold text-slate-700">Reference List ({citations.length})</label>
                </div>
                <div className="flex gap-2">
                  {citations.length > 0 && (
                    <>
                      <Button variant="outline" size="sm" onClick={() => handleDownload('apa')} className="bg-white hover:bg-slate-50">
                        <Download className="mr-2 h-3 w-3" /> APA
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => handleDownload('bibtex')} className="bg-white hover:bg-slate-50">
                        <Download className="mr-2 h-3 w-3" /> BibTeX
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setCitations([])} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                        Clear
                      </Button>
                    </>
                  )}
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30 custom-scrollbar">
                {citations.length > 0 ? (
                  <div className="space-y-6">
                    {citations.map((citation) => (
                      <div 
                        key={citation.id} 
                        id={`citation-${citation.id}`}
                        className="group relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-lg duration-300 hover:-translate-y-1"
                      >
                        <div className="mb-4 flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-slate-50 border-slate-200 text-slate-500">Source: {citation.source}</Badge>
                          </div>
                          <button 
                            onClick={() => handleDelete(citation.id)}
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500 p-1 hover:bg-red-50 rounded-full"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="space-y-5">
                          {/* APA */}
                          <div>
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">APA 7</span>
                              <button 
                                onClick={() => handleCopy(citation.apa, `${citation.id}-apa`)}
                                className="text-slate-400 hover:text-indigo-600 transition-colors"
                              >
                                {copiedId === `${citation.id}-apa` ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                              </button>
                            </div>
                            <p className="text-sm text-slate-800 leading-relaxed font-serif">{citation.apa}</p>
                          </div>

                          {/* BibTeX */}
                          <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 group-hover:bg-indigo-50/30 transition-colors">
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">BibTeX</span>
                              <button 
                                onClick={() => handleCopy(citation.bibtex, `${citation.id}-bib`)}
                                className="text-slate-400 hover:text-indigo-600 transition-colors"
                              >
                                {copiedId === `${citation.id}-bib` ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                              </button>
                            </div>
                            <pre className="overflow-x-auto text-[11px] text-slate-600 font-mono leading-relaxed">
                              {citation.bibtex}
                            </pre>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
                    <div className="mb-6 rounded-full bg-white p-6 shadow-sm border border-slate-100">
                      <Quote className="h-10 w-10 opacity-20 text-indigo-500" />
                    </div>
                    <h3 className="mb-2 font-bold text-slate-900 text-lg">No citations yet</h3>
                    <p className="text-sm max-w-xs leading-relaxed">Highlight text in the manuscript and click "Generate Citation" to add to this list.</p>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
