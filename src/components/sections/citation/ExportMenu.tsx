import React from 'react';
import { Download, Copy, Check, FileText, ChevronDown } from 'lucide-react';
import { Citation } from '../CitationWorkspace';
import { CitationStyle } from '../../../api/citationApi';

interface ExportMenuProps {
  citations: Citation[];
  activeStyle: CitationStyle;
  articleTitle: string;
}

export function ExportMenu({ citations, activeStyle, articleTitle }: ExportMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const buildRefList = () =>
    citations.map((c, i) => `${i + 1}. ${c[activeStyle] || c.apa}`).join('\n\n');

  const buildBibtex = () =>
    citations.map((c) => c.bibtex || c.apa).join('\n\n');

  const handleCopy = () => {
    navigator.clipboard.writeText(buildRefList());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    setOpen(false);
  };

  const handleDownloadBib = () => {
    const blob = new Blob([buildBibtex()], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${articleTitle.replace(/\s+/g, '_') || 'references'}.bib`;
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  const handleDownloadTxt = () => {
    const content = `${articleTitle}\n\nReferences\n\n${buildRefList()}`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${articleTitle.replace(/\s+/g, '_') || 'document'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={citations.length === 0}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-stone-900 text-white rounded-xl text-xs font-bold hover:bg-stone-700 transition-all disabled:opacity-40 active:scale-95"
      >
        <Download className="h-3.5 w-3.5" />
        Export
        <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-stone-200 rounded-2xl shadow-panel overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
          <p className="px-3 pt-2.5 pb-1 text-[9px] font-bold uppercase tracking-widest text-stone-400">
            Export as
          </p>
          <button
            onClick={handleCopy}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-stone-50 text-left transition-colors"
          >
            {copied ? <Check className="h-4 w-4 text-sage-500" /> : <Copy className="h-4 w-4 text-stone-400" />}
            <span className="text-sm text-stone-700 font-medium">Copy references</span>
          </button>
          <button
            onClick={handleDownloadTxt}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-stone-50 text-left transition-colors"
          >
            <FileText className="h-4 w-4 text-stone-400" />
            <span className="text-sm text-stone-700 font-medium">Download .txt</span>
          </button>
          <button
            onClick={handleDownloadBib}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-stone-50 text-left transition-colors border-t border-stone-50"
          >
            <Download className="h-4 w-4 text-stone-400" />
            <span className="text-sm text-stone-700 font-medium">Download .bib</span>
          </button>
        </div>
      )}
    </div>
  );
}
