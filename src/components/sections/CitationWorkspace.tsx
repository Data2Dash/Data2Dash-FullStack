import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Sparkles, FileText,
  Bold, Italic, Underline, Strikethrough,
  List, Quote, X, Plus, Trash2, Upload,
  BookMarked, Clock, ChevronRight,
  Search, Library,
} from 'lucide-react';
import * as mammoth from 'mammoth';

import {
  CitationPaper, CitationStyle,
  searchCitations, formatCitation, isDuplicate,
} from '../../api/citationApi';

import { SourcePanel } from './SourcePanel';
import { StyleSelector } from './citation/StyleSelector';
import { ReferenceList } from './citation/ReferenceList';
import { StatusBar } from './citation/StatusBar';
import { ExportMenu } from './citation/ExportMenu';
import { useDocumentLibrary, DocRecord, StoredCitation } from '../../store/useDocumentLibrary';
import { useAuthStore, registerBeforeLogout, unregisterBeforeLogout } from '../../store/authStore';
import { useCitationStore } from '../../store/useCitationStore';

// ─── Types ────────────────────────────────────────────────────────────────────

// Citation extends StoredCitation — no circular import needed
export interface Citation extends StoredCitation {}

const DEMO_CONTENT = `In recent years, the integration of advanced natural language processing has profoundly
transformed information retrieval. The attention mechanism provides a powerful framework
for contextual understanding. This has enabled new methodologies in extracting insights
from unstructured academic literature. Future developments are likely to focus on efficient
long-context processing.`;

// ─── Sidebar Modes ────────────────────────────────────────────────────────────
type SidebarMode = 'nav' | 'library';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function timeSince(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CitationWorkspace() {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const { user, token } = useAuthStore();
  const { docs, syncing, createDoc, upsertDoc, deleteDoc } = useDocumentLibrary(user?.id ?? null, token);

  // ── Active document ──
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [articleTitle, setArticleTitle] = useState('My Article');
  const [activeStyle, setActiveStyle] = useState<CitationStyle>('apa');
  const [citations, setCitations] = useState<Citation[]>([]);
  const [citedPapers, setCitedPapers] = useState<CitationPaper[]>([]);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [counts, setCounts] = useState({ words: 0, chars: 0 });

  // ── Sidebar ──
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>('nav');

  // ── Citation search ──
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [savedRange, setSavedRange] = useState<Range | null>(null);
  const [searchResults, setSearchResults] = useState<CitationPaper[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [citingPaperId, setCitingPaperId] = useState<string | null>(null);
  const [citedPaperIds, setCitedPaperIds] = useState<Set<string>>(new Set());
  const [floatBtn, setFloatBtn] = useState<{ top: number; left: number } | null>(null);

  // ── Toast ──
  const [toast, setToast] = useState<{ msg: string; type: 'info' | 'error' | 'success' } | null>(null);

  // ─── Toast helper ─────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string, type: 'info' | 'error' | 'success' = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ─── Word / char count ────────────────────────────────────────────────────
  const updateCounts = useCallback(() => {
    if (!editorRef.current) return;
    const text = editorRef.current.innerText || '';
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    setCounts({ words, chars: text.length });
  }, []);

  useEffect(() => { updateCounts(); }, [updateCounts]);

  // ─── Auto-save every 30s ─────────────────────────────────────────────────
  const doSave = useCallback(() => {
    if (!editorRef.current) return;
    const bodyHtml = editorRef.current.innerHTML;
    const rec: DocRecord = {
      id: activeDocId ?? `doc_${Date.now()}`,
      title: articleTitle,
      bodyHtml,
      citations,
      activeStyle,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      wordCount: counts.words,
    };
    upsertDoc(rec);
    if (!activeDocId) setActiveDocId(rec.id);
    setLastSaved(new Date());
  }, [activeDocId, articleTitle, citations, activeStyle, counts.words, upsertDoc]);

  useEffect(() => {
    saveTimer.current = setInterval(doSave, 30_000);
    return () => { if (saveTimer.current) clearInterval(saveTimer.current); };
  }, [doSave]);

  // ─── Fix 1: Register doSave as a before-logout callback ──────────────────
  useEffect(() => {
    registerBeforeLogout(doSave);
    return () => unregisterBeforeLogout(doSave);
  }, [doSave]);

  // ─── Fix 2: Auto-open latest doc on login, seed DEMO_CONTENT for new users
  const hasAutoOpened = useRef(false);
  useEffect(() => {
    if (hasAutoOpened.current || activeDocId) return;

    if (docs.length > 0) {
      // User has saved docs — open the most recent one
      hasAutoOpened.current = true;
      const latest = docs[0]; // sorted newest-first by backend
      setActiveDocId(latest.id);
      setArticleTitle(latest.title);
      setActiveStyle(latest.activeStyle);
      setCitations(latest.citations);
      setCitedPapers([]);
      setCitedPaperIds(new Set());
      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.innerHTML = latest.bodyHtml || '';
          updateCounts();
        }
      }, 50);
    } else if (!syncing) {
      // Sync is done and there are truly no docs — seed demo content
      hasAutoOpened.current = true;
      if (editorRef.current && !editorRef.current.innerHTML.trim()) {
        editorRef.current.innerHTML = DEMO_CONTENT;
        updateCounts();
      }
    }
  }, [docs, syncing]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDoc = useCallback((doc: DocRecord) => {
    // Save current doc first
    doSave();
    // Load new doc
    setActiveDocId(doc.id);
    setArticleTitle(doc.title);
    setActiveStyle(doc.activeStyle);
    setCitations(doc.citations);
    setCitedPapers([]);
    setCitedPaperIds(new Set());
    setIsPanelOpen(false);
    setFloatBtn(null);
    setSidebarMode('nav');
    // Inject HTML into editor on next tick
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = doc.bodyHtml || '';
        updateCounts();
      }
    }, 50);
  }, [doSave, updateCounts]);

  // ─── Listen for cross-tab requests to open a document ─────────────────────
  const { pendingOpenDocId, setPendingOpenDocId } = useCitationStore();
  
  useEffect(() => {
    if (pendingOpenDocId) {
      const targetDoc = docs.find(d => d.id === pendingOpenDocId);
      if (targetDoc && targetDoc.id !== activeDocId) {
        openDoc(targetDoc);
      }
      setPendingOpenDocId(null);
    }
  }, [pendingOpenDocId, docs, activeDocId, openDoc, setPendingOpenDocId]);

  // ─── New blank document ───────────────────────────────────────────────────
  const handleNewDoc = () => {
    doSave();
    const doc = createDoc();
    setActiveDocId(doc.id);
    setArticleTitle(doc.title);
    setActiveStyle('apa');
    setCitations([]);
    setCitedPapers([]);
    setCitedPaperIds(new Set());
    setIsPanelOpen(false);
    setFloatBtn(null);
    setSidebarMode('nav');
    setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = '';
        updateCounts();
      }
    }, 50);
  };

  // ─── Upload .docx ─────────────────────────────────────────────────────────
  const handleDocxUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.docx')) {
      showToast('Only .docx files are supported.', 'error');
      return;
    }
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });
      const html = result.value;

      doSave();
      const doc = createDoc();
      const title = file.name.replace(/\.docx$/, '');
      const updatedDoc: DocRecord = {
        ...doc,
        title,
        bodyHtml: html,
        updatedAt: new Date().toISOString(),
      };
      upsertDoc(updatedDoc);

      setActiveDocId(updatedDoc.id);
      setArticleTitle(title);
      setActiveStyle('apa');
      setCitations([]);
      setCitedPapers([]);
      setCitedPaperIds(new Set());
      setIsPanelOpen(false);
      setSidebarMode('nav');

      setTimeout(() => {
        if (editorRef.current) {
          editorRef.current.innerHTML = html;
          updateCounts();
        }
      }, 50);

      showToast(`"${title}" imported from .docx`, 'success');
    } catch {
      showToast('Failed to read .docx file. Please try again.', 'error');
    }
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ─── DOM marker helpers ───────────────────────────────────────────────────
  const clearMarkers = () => {
    editorRef.current?.querySelectorAll('.cite-marker').forEach((m) => m.remove());
  };

  // ─── Text selection → float button ───────────────────────────────────────
  const handleMouseUp = () => {
    const selection = window.getSelection();
    if (!selection || selection.toString().trim().length === 0) { setFloatBtn(null); return; }
    if (!editorRef.current?.contains(selection.anchorNode)) { setFloatBtn(null); return; }

    const text = selection.toString().trim();
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    setSelectedText(text);
    setFloatBtn({
      top: rect.top + window.scrollY - 48,
      left: Math.min(rect.left + window.scrollX + rect.width / 2, window.innerWidth - 180),
    });

    clearMarkers();
    const marker = document.createElement('span');
    marker.className = 'cite-marker h-0 w-0 pointer-events-none opacity-0';
    marker.id = 'active-cite-marker';
    const markerRange = range.cloneRange();
    markerRange.collapse(false);
    markerRange.insertNode(marker);
    setSavedRange(range.cloneRange());
    updateCounts();
  };

  // ─── Trigger search ───────────────────────────────────────────────────────
  const triggerCiteSearch = async () => {
    if (!selectedText) return;
    setFloatBtn(null);
    setIsPanelOpen(true);
    setIsSearching(true);
    setSearchResults([]);
    try {
      const results = await searchCitations(selectedText);
      setSearchResults(results);
    } catch {
      showToast('Search failed. Try again or search manually.', 'error');
    } finally {
      setIsSearching(false);
    }
  };

  // ─── Insert citation ──────────────────────────────────────────────────────
  const handleCitePaper = async (paper: CitationPaper) => {
    const alreadyFullyCited = isDuplicate(paper, citedPapers);
    setCitingPaperId(paper.id);

    let marker = document.getElementById('active-cite-marker') as HTMLElement | null;
    if (!marker && savedRange && editorRef.current) {
      marker = document.createElement('span');
      marker.id = 'active-cite-marker';
      marker.className = 'cite-marker';
      try {
        const sel = window.getSelection();
        if (sel) { sel.removeAllRanges(); sel.addRange(savedRange); savedRange.collapse(false); savedRange.insertNode(marker); }
      } catch { /* fallback failed */ }
    }

    if (!marker) {
      showToast('Selection lost. Please re-highlight the text.', 'error');
      setCitingPaperId(null);
      return;
    }

    const authorDisplay = paper.authors?.length > 0 ? (paper.authors[0].split(' ').pop() || 'Unknown') : 'Unknown';
    const inlineText = ` (${authorDisplay} et al., ${paper.year})`;

    const citationNode = document.createElement('span');
    citationNode.textContent = inlineText;
    citationNode.className = 'inline-citation text-sage-600 font-semibold cursor-help whitespace-nowrap';
    citationNode.setAttribute('data-paper-id', paper.id);
    citationNode.title = `${paper.title} — ${paper.authors?.join(', ')} (${paper.year})`;
    marker.replaceWith(citationNode);
    clearMarkers();
    updateCounts();

    setCitedPaperIds((prev) => new Set([...prev, paper.id]));
    const tempId = Math.random().toString(36).substr(2, 9);
    setCitations((prev) => [...prev, {
      id: tempId, paperId: paper.id,
      apa: '', mla: '', chicago: '', ieee: '', harvard: '', bibtex: '',
      source: paper.doi ? `https://doi.org/${paper.doi}` : paper.url,
      pending: true,
    }]);

    if (!alreadyFullyCited) { setCitedPapers((prev) => [...prev, paper]); }
    else { showToast(`${authorDisplay} et al. (${paper.year}) already cited ✓`, 'info'); }

    try {
      const formatted = await formatCitation(paper);
      setCitations((prev) => prev.map((c) => c.id === tempId ? { ...c, ...formatted, pending: false } : c));
    } catch {
      setCitations((prev) => prev.map((c) => c.id === tempId ? { ...c, pending: false } : c));
      showToast('Citation inserted, but reference list failed to format.', 'error');
    } finally {
      setCitingPaperId(null);
      setSavedRange(null);
    }
  };

  // ─── Retry formatting ─────────────────────────────────────────────────────
  const handleRetry = async (citation: Citation) => {
    const paper = citedPapers.find((p) => p.id === citation.paperId);
    if (!paper) return;
    try {
      const formatted = await formatCitation(paper);
      setCitations((prev) => prev.map((c) => c.id === citation.id ? { ...c, ...formatted } : c));
    } catch { showToast('Retry failed.', 'error'); }
  };

  const handleImport = (paper: CitationPaper) => {
    setSearchResults((prev) => [{ ...paper, relevanceScore: 100 }, ...prev]);
    showToast(`"${paper.title}" imported — click Cite to insert.`, 'success');
  };

  const execFormat = (cmd: string) => { document.execCommand(cmd, false, undefined); editorRef.current?.focus(); };

  // ─── Title + style change triggers instant save ───────────────────────────
  const handleTitleChange = (val: string) => { setArticleTitle(val); };
  const handleStyleChange = (style: CitationStyle) => { setActiveStyle(style); };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="h-full w-full bg-stone-50 dark:bg-zinc-950 text-stone-900 dark:text-zinc-100 flex font-sans selection:bg-sage-100 dark:selection:bg-emerald-500/20 selection:text-sage-900 dark:selection:text-emerald-100 overflow-hidden">

      {/* Hidden file input for .docx */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx"
        className="hidden"
        onChange={handleDocxUpload}
      />

      {/* ── Main column ── */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-zinc-900">

        {/* Workspace header bar */}
        <header className="h-14 border-b border-stone-200 dark:border-zinc-700 flex items-center justify-between px-6 bg-white dark:bg-zinc-900 shrink-0 z-30">
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-stone-50 dark:bg-zinc-950 rounded-xl border border-stone-100 dark:border-zinc-800">
              <FileText className="h-4 w-4 text-stone-400 dark:text-zinc-500" />
              <input
                value={articleTitle}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="bg-transparent border-none focus:ring-0 text-sm font-bold text-stone-900 dark:text-zinc-100 placeholder:text-stone-300 dark:placeholder:text-zinc-500 w-[150px] md:w-[300px]"
                placeholder="Untitled Article"
              />
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-stone-400 dark:text-zinc-500 uppercase tracking-widest bg-stone-50 dark:bg-zinc-950 px-2 py-1 rounded-lg">
              <div className={`h-1.5 w-1.5 rounded-full ${syncing ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'}`} />
              {syncing ? 'Syncing' : 'Saved'}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <StyleSelector active={activeStyle} onChange={handleStyleChange} />
            <div className="flex bg-stone-100 dark:bg-zinc-800 rounded-xl p-0.5">
              <button onClick={handleNewDoc} className="px-3 py-1.5 text-xs font-bold text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 transition-colors" title="New Page">
                <Plus className="h-4 w-4" />
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 text-xs font-bold text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 transition-colors border-l border-stone-200 dark:border-zinc-700" title="Upload .docx">
                <Upload className="h-4 w-4" />
              </button>
            </div>
            <div className="w-px h-4 bg-stone-200 dark:bg-zinc-700 mx-1" />
            <ExportMenu citations={citations} activeStyle={activeStyle} articleTitle={articleTitle} />
          </div>
        </header>


        {/* Editor + Source Panel row */}
        <div className="flex-1 flex overflow-hidden relative">

          {/* Editor area */}
          <main className="flex-1 overflow-y-auto custom-scrollbar px-4 py-8 bg-dot-pattern relative">

            {/* Floating Cite This button */}
            {floatBtn && selectedText && (
              <button
                onMouseDown={(e) => { e.preventDefault(); triggerCiteSearch(); }}
                className="fixed z-40 flex items-center gap-1.5 px-3 py-2 bg-stone-900 text-white text-xs font-bold rounded-full shadow-panel hover:bg-stone-700 active:scale-95 transition-all animate-in fade-in zoom-in-90 duration-150"
                style={{ top: floatBtn.top, left: floatBtn.left, transform: 'translateX(-50%)' }}
              >
                <Sparkles className="h-3.5 w-3.5 text-sage-300 dark:text-emerald-300" />
                Cite This
                <span className="text-[10px] text-stone-400 dark:text-zinc-500 font-normal hidden sm:inline">Ctrl+K</span>
              </button>
            )}

            {/* Document card */}
            <div className="max-w-3xl mx-auto bg-white dark:bg-zinc-900 rounded-[2.5rem] shadow-card border border-stone-100 dark:border-zinc-800 p-10 md:p-16 min-h-full">
              <input
                value={articleTitle}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="text-3xl md:text-4xl font-extrabold bg-transparent border-none outline-none text-stone-900 dark:text-zinc-100 mb-8 placeholder:text-stone-200 dark:placeholder:text-zinc-500 w-full"
                placeholder="Article title…"
              />

              <div
                ref={editorRef}
                contentEditable
                onMouseUp={handleMouseUp}
                onKeyUp={updateCounts}
                onInput={updateCounts}
                suppressContentEditableWarning
                className="text-lg leading-[1.9] text-stone-700 dark:text-zinc-300 outline-none font-serif min-h-[350px] selection:bg-sage-100 dark:selection:bg-emerald-500/20"
              />

              <ReferenceList citations={citations} activeStyle={activeStyle} onRetry={handleRetry} />
            </div>
          </main>

          {/* Source Panel */}
          {isPanelOpen && (
            <SourcePanel
              isOpen={isPanelOpen}
              query={selectedText}
              papers={searchResults}
              isSearching={isSearching}
              citedPaperIds={citedPaperIds}
              citingPaperId={citingPaperId}
              existingPapers={citedPapers}
              onCite={handleCitePaper}
              onClose={() => setIsPanelOpen(false)}
              onImport={handleImport}
            />
          )}
        </div>

        {/* Bottom formatting toolbar */}
        <div className="shrink-0 border-t border-stone-200 dark:border-zinc-700 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md px-4 md:px-6 h-11 flex items-center justify-between gap-4 z-20">
          <div className="flex items-center gap-0.5">
            <span className="text-[10px] font-bold text-stone-300 dark:text-zinc-600 uppercase tracking-wider mr-2 hidden md:inline">Format</span>
            {[
              { icon: Bold, cmd: 'bold', title: 'Bold' },
              { icon: Italic, cmd: 'italic', title: 'Italic' },
              { icon: Underline, cmd: 'underline', title: 'Underline' },
              { icon: Strikethrough, cmd: 'strikeThrough', title: 'Strikethrough' },
            ].map(({ icon: Icon, cmd, title }) => (
              <button
                key={cmd}
                title={title}
                onMouseDown={(e) => { e.preventDefault(); execFormat(cmd); }}
                className="p-1.5 text-stone-400 dark:text-zinc-500 hover:text-stone-900 dark:hover:text-zinc-100 hover:bg-stone-100 dark:hover:bg-zinc-700 rounded-lg transition-all"
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
            <div className="w-px h-4 bg-stone-100 dark:bg-zinc-800 mx-1" />
            {[
              { icon: List, cmd: 'insertUnorderedList', title: 'List' },
              { icon: Quote, cmd: 'formatBlock', title: 'Quote' },
            ].map(({ icon: Icon, cmd, title }) => (
              <button
                key={cmd}
                title={title}
                onMouseDown={(e) => { e.preventDefault(); execFormat(cmd); }}
                className="p-1.5 text-stone-400 dark:text-zinc-500 hover:text-stone-900 dark:hover:text-zinc-100 hover:bg-stone-100 dark:hover:bg-zinc-700 rounded-lg transition-all"
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>

          <StatusBar words={counts.words} chars={counts.chars} citationCount={citations.length} lastSaved={lastSaved} />
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-20 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-2 px-4 py-2.5 rounded-2xl shadow-panel text-sm font-semibold animate-in fade-in slide-in-from-top-2 duration-200 border
          ${toast.type === 'error' ? 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400 border-red-100 dark:border-red-500/20'
            : toast.type === 'success' ? 'bg-sage-50 dark:bg-emerald-500/10 text-sage-700 dark:text-emerald-400 border-sage-100 dark:border-emerald-500/20'
            : 'bg-stone-900 text-white border-transparent'}`}
        >
          {toast.msg}
          <button onClick={() => setToast(null)} className="opacity-50 hover:opacity-100 ml-1">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
