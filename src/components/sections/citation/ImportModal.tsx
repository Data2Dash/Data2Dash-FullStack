// ImportModal — import via DOI, URL, or paper title
import React, { useState } from 'react';
import { X, Search, Plus, Loader2, AlertCircle } from 'lucide-react';
import { importCitation, CitationPaper } from '../../../api/citationApi';

interface ImportModalProps {
  onImport: (paper: CitationPaper) => void;
  onClose: () => void;
}

export function ImportModal({ onImport, onClose }: ImportModalProps) {
  const [tab, setTab] = useState<'doi' | 'url' | 'title'>('doi');
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const placeholder = {
    doi: 'e.g. 10.48550/arXiv.1706.03762',
    url: 'e.g. https://arxiv.org/abs/1706.03762',
    title: 'e.g. Attention Is All You Need',
  }[tab];

  const handleImport = async () => {
    if (!value.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const paper = await importCitation({ [tab]: value.trim() });
      onImport(paper);
      onClose();
    } catch {
      setError(`Could not find a paper from this ${tab.toUpperCase()}. Please check and try again.`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-stone-900/30 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-3xl shadow-panel w-full max-w-md mx-4 p-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-base font-bold text-stone-900">Import Citation</h3>
            <p className="text-xs text-stone-400 mt-0.5">Look up a paper by DOI, URL, or title</p>
          </div>
          <button onClick={onClose} className="text-stone-300 hover:text-stone-600 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-stone-100 p-1 rounded-xl mb-4">
          {(['doi', 'url', 'title'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setValue(''); setError(null); }}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide transition-all ${
                tab === t
                  ? 'bg-white text-stone-900 shadow-soft'
                  : 'text-stone-400 hover:text-stone-600'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={placeholder}
            onKeyDown={(e) => e.key === 'Enter' && handleImport()}
            className="w-full bg-stone-50 border border-stone-200 rounded-xl py-2.5 pl-10 pr-4 text-sm text-stone-900 placeholder:text-stone-300 focus:ring-2 focus:ring-sage-200 focus:border-sage-400 outline-none transition-all"
            autoFocus
          />
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2 mb-4">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-stone-100 text-stone-600 text-sm font-semibold hover:bg-stone-200 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={loading || !value.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-stone-900 text-white text-sm font-bold hover:bg-stone-700 transition-all disabled:opacity-50 active:scale-[0.98]"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {loading ? 'Searching…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
