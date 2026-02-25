import React, { useState, useRef } from 'react';
import { Quote, Copy, Check, Sparkles, Trash2, Download, FileText, PenTool } from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

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
    setTimeout(() => {
      const id = Math.random().toString(36).substr(2, 9);
      const newCitation: Citation = {
        id,
        source: selectedText.length > 20 ? selectedText.substring(0, 20) + '…' : selectedText,
        apa: 'Smith, J. (2023). Artificial Intelligence in Academic Research. Journal of Future Technology, 12(3), 45–67.',
        bibtex: `@article{smith2023ai,\n  title={AI in Academic Research},\n  author={Smith, John},\n  journal={Journal of Future Technology},\n  year={2023}\n}`,
        mla: 'Smith, John. "Artificial Intelligence in Academic Research." Journal of Future Technology 12.3 (2023): 45–67.',
      };
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const span = document.createElement('span');
        span.className = 'text-sage-700 font-semibold cursor-pointer bg-sage-50 px-1 py-0.5 rounded mx-0.5 border border-sage-200';
        span.textContent = `(Smith, 2023)`;
        span.onclick = (e) => {
          e.stopPropagation();
          document.getElementById(`citation-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        };
        range.deleteContents();
        range.insertNode(span);
        selection.removeAllRanges();
      }
      setCitations((prev) => [newCitation, ...prev]);
      setIsGenerating(false);
      setSelectedText('');
    }, 1400);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownload = (format: 'apa' | 'bibtex' | 'mla') => {
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
    <div className="min-h-screen bg-stone-50 pt-14 flex flex-col">
      <div className="flex-1 flex flex-col max-w-6xl mx-auto w-full px-6 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-stone-900 mb-2">Citation Helper</h1>
          <p className="text-stone-500">Highlight text in your manuscript to auto-generate citations.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
          {/* ── Manuscript Editor ── */}
          <div className="flex flex-col rounded-2xl border border-stone-200 bg-white shadow-soft overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <PenTool className="h-4 w-4 text-stone-400" />
                <span className="text-sm font-semibold text-stone-800">Manuscript</span>
              </div>
              <Badge variant={selectedText ? 'sage' : 'secondary'} className="transition-all">
                {selectedText ? 'Text selected' : 'Select to cite'}
              </Badge>
            </div>

            <div className="relative flex-1">
              <div
                ref={editorRef}
                contentEditable
                onMouseUp={handleTextSelect}
                onTouchEnd={handleTextSelect}
                className="h-full min-h-[400px] w-full overflow-y-auto px-8 py-6 text-base leading-8 text-stone-700 focus:outline-none font-serif custom-scrollbar"
                suppressContentEditableWarning
              >
                As discussed by Smith (2023), the integration of AI in research workflows has
                significantly improved efficiency. However, concerns regarding data privacy remain
                prevalent among academic institutions. The adoption of large language models has
                accelerated publication cycles, though peer-review rigor must be preserved.
              </div>

              {selectedText && (
                <div className="absolute bottom-6 right-6 z-10">
                  <button
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-stone-900 text-white text-sm font-medium shadow-panel hover:bg-stone-700 disabled:opacity-60 transition-all"
                  >
                    {isGenerating ? (
                      <><Sparkles className="h-4 w-4 animate-spin" /> Generating…</>
                    ) : (
                      <><Quote className="h-4 w-4" /> Generate Citation</>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Reference List ── */}
          <div className="flex flex-col rounded-2xl border border-stone-200 bg-white shadow-soft overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-stone-400" />
                <span className="text-sm font-semibold text-stone-800">
                  References ({citations.length})
                </span>
              </div>
              {citations.length > 0 && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleDownload('apa')}>
                    <Download className="h-3 w-3" /> APA
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDownload('bibtex')}>
                    <Download className="h-3 w-3" /> BibTeX
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setCitations([])} className="text-red-500 hover:text-red-600 hover:bg-red-50">
                    Clear
                  </Button>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar min-h-[400px]">
              {citations.length > 0 ? (
                <div className="space-y-4">
                  {citations.map((citation) => (
                    <div
                      key={citation.id}
                      id={`citation-${citation.id}`}
                      className="group rounded-2xl border border-stone-100 bg-stone-50 p-5 transition-all hover:border-stone-200"
                    >
                      <div className="flex items-start justify-between mb-4">
                        <Badge variant="outline">"{citation.source}"</Badge>
                        <button
                          onClick={() => handleDownload('apa')}
                          className="opacity-0 group-hover:opacity-100 text-stone-400 hover:text-red-500 transition-all p-1 rounded"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="space-y-4">
                        {/* APA */}
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-sage-700">APA 7</span>
                            <button onClick={() => handleCopy(citation.apa, `${citation.id}-apa`)} className="text-stone-400 hover:text-stone-700 transition-colors">
                              {copiedId === `${citation.id}-apa` ? <Check className="h-3.5 w-3.5 text-sage-600" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                          <p className="text-sm text-stone-700 leading-relaxed font-serif">{citation.apa}</p>
                        </div>

                        {/* BibTeX */}
                        <div className="rounded-xl bg-white border border-stone-200 p-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">BibTeX</span>
                            <button onClick={() => handleCopy(citation.bibtex, `${citation.id}-bib`)} className="text-stone-400 hover:text-stone-700 transition-colors">
                              {copiedId === `${citation.id}-bib` ? <Check className="h-3.5 w-3.5 text-sage-600" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                          <pre className="overflow-x-auto text-[11px] text-stone-600 font-mono leading-relaxed">{citation.bibtex}</pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-stone-400 py-16 text-center">
                  <div className="p-4 rounded-2xl bg-stone-100 mb-4">
                    <Quote className="h-6 w-6 opacity-40" />
                  </div>
                  <p className="font-medium text-stone-600 mb-1">No references yet</p>
                  <p className="text-sm max-w-xs">Select text in the manuscript and click "Generate Citation".</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
