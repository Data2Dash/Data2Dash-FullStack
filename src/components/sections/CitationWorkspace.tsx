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

  // ─── Open document from library ───────────────────────────────────────────
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
    <div className="min-h-0 h-[calc(100vh-3.5rem)] mt-14 bg-stone-50 text-stone-900 flex font-sans selection:bg-sage-100 selection:text-sage-900 overflow-hidden">

      {/* Hidden file input for .docx */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".docx"
        className="hidden"
        onChange={handleDocxUpload}
      />

      {/* ── Left Sidebar ── */}
      <aside className="w-64 border-r border-stone-200 flex flex-col shrink-0 hidden lg:flex bg-white z-10 overflow-hidden">

        {/* Sidebar top actions */}
        <div className="p-3 border-b border-stone-100 flex flex-col gap-2">
          {/* New document */}
          <button
            onClick={handleNewDoc}
            className="w-full flex items-center gap-2 px-3 py-2.5 bg-stone-900 text-white rounded-xl text-sm font-bold hover:bg-stone-700 transition-all active:scale-[0.98] shadow-soft"
          >
            <Plus className="h-4 w-4" />
            New Page
          </button>

          {/* Upload .docx */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full flex items-center gap-2 px-3 py-2 border border-stone-200 text-stone-600 rounded-xl text-sm font-medium hover:bg-stone-50 hover:border-stone-300 transition-all"
          >
            <Upload className="h-4 w-4 text-stone-400" />
            Upload .docx
          </button>
        </div>

        {/* Nav tabs */}
        <div className="flex border-b border-stone-100">
          <button
            onClick={() => setSidebarMode('nav')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors ${
              sidebarMode === 'nav' ? 'text-stone-900 border-b-2 border-stone-900' : 'text-stone-400 hover:text-stone-600'
            }`}
          >
            <Search className="h-3.5 w-3.5" />
            Navigate
          </button>
          <button
            onClick={() => setSidebarMode('library')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold uppercase tracking-wide transition-colors ${
              sidebarMode === 'library' ? 'text-stone-900 border-b-2 border-stone-900' : 'text-stone-400 hover:text-stone-600'
            }`}
          >
            <Library className="h-3.5 w-3.5" />
            Library
            {docs.length > 0 && (
              <span className="ml-0.5 text-[9px] bg-sage-100 text-sage-700 px-1.5 py-0.5 rounded-full font-bold">
                {docs.length}
              </span>
            )}
          </button>
        </div>

        {/* ── NAV MODE ── */}
        {sidebarMode === 'nav' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-1">
            <div className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium bg-stone-900 text-white">
              <BookMarked className="h-4 w-4" />
              Citation
            </div>

            {/* Current doc info */}
            <div className="mt-4 pt-4 border-t border-stone-100">
              <p className="px-3 text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-2">Current</p>
              <div className="px-3 py-2 bg-stone-50 rounded-xl">
                <p className="text-sm font-semibold text-stone-800 truncate">{articleTitle || 'Untitled'}</p>
                <p className="text-[11px] text-stone-400 mt-0.5">{counts.words} words · {citations.length} citations</p>
              </div>
            </div>

            {/* Stats */}
            <div className="mt-4 px-3 space-y-2.5">
              <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">Stats</p>
              {[
                { label: 'Words', value: counts.words.toLocaleString() },
                { label: 'Characters', value: counts.chars.toLocaleString() },
                { label: 'Citations', value: citations.length.toString() },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between items-center">
                  <span className="text-xs text-stone-400 font-medium">{label}</span>
                  <span className="text-xs text-stone-900 font-bold tabular-nums">{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── LIBRARY MODE ── */}
        {sidebarMode === 'library' && (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            {docs.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
                <div className="h-12 w-12 bg-stone-100 rounded-2xl flex items-center justify-center">
                  <FileText className="h-5 w-5 text-stone-300" />
                </div>
                <p className="text-sm font-semibold text-stone-500">No saved pages yet</p>
                <p className="text-xs text-stone-400">Click "New Page" to start writing, or upload a .docx</p>
              </div>
            ) : (
              <div className="p-2">
                {docs.map((doc) => {
                  const isActive = doc.id === activeDocId;
                  return (
                    <div
                      key={doc.id}
                      className={`group relative flex items-start gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all mb-1 ${
                        isActive ? 'bg-stone-900 text-white' : 'hover:bg-stone-50 text-stone-700'
                      }`}
                      onClick={() => openDoc(doc)}
                    >
                      <FileText className={`h-4 w-4 mt-0.5 shrink-0 ${isActive ? 'text-stone-300' : 'text-stone-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${isActive ? 'text-white' : 'text-stone-800'}`}>
                          {doc.title || 'Untitled'}
                        </p>
                        <div className={`flex items-center gap-1.5 mt-0.5 text-[10px] ${isActive ? 'text-stone-400' : 'text-stone-400'}`}>
                          <Clock className="h-2.5 w-2.5" />
                          {timeSince(doc.updatedAt)}
                          <span>·</span>
                          <span>{doc.wordCount} w</span>
                          {doc.citations.length > 0 && (
                            <><span>·</span><span>{doc.citations.length} cites</span></>
                          )}
                        </div>
                      </div>
                      {/* Delete button — visible on hover */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete "${doc.title}"?`)) {
                            deleteDoc(doc.id);
                            if (isActive) {
                              setActiveDocId(null);
                              setArticleTitle('My Article');
                              setCitations([]);
                              if (editorRef.current) editorRef.current.innerHTML = DEMO_CONTENT;
                            }
                          }
                        }}
                        className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-red-50 hover:text-red-500 shrink-0 ${
                          isActive ? 'text-stone-400' : 'text-stone-300'
                        }`}
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                      <ChevronRight className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${isActive ? 'text-stone-500' : 'text-stone-300'}`} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Sidebar bottom — save now */}
        <div className="p-3 border-t border-stone-100">
          <button
            onClick={doSave}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-stone-500 hover:text-stone-900 hover:bg-stone-50 rounded-xl transition-all font-medium"
          >
            <Sparkles className="h-3.5 w-3.5 text-sage-500" />
            Save Now
          </button>
        </div>
      </aside>

      {/* ── Main column ── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Workspace header bar */}
        <header className="h-12 border-b border-stone-200 flex items-center justify-between px-4 md:px-6 bg-white/90 backdrop-blur-md z-30 shrink-0 gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="h-3.5 w-3.5 text-stone-400 shrink-0" />
            <input
              value={articleTitle}
              onChange={(e) => handleTitleChange(e.target.value)}
              className="text-sm font-semibold bg-transparent border-none outline-none text-stone-700 truncate max-w-[180px] md:max-w-xs placeholder:text-stone-300"
              placeholder="Article title…"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <StyleSelector active={activeStyle} onChange={handleStyleChange} />
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
                <Sparkles className="h-3.5 w-3.5 text-sage-300" />
                Cite This
                <span className="text-[10px] text-stone-400 font-normal hidden sm:inline">Ctrl+K</span>
              </button>
            )}

            {/* Document card */}
            <div className="max-w-3xl mx-auto bg-white rounded-[2.5rem] shadow-card border border-stone-100 p-10 md:p-16 min-h-full">
              <input
                value={articleTitle}
                onChange={(e) => handleTitleChange(e.target.value)}
                className="text-3xl md:text-4xl font-extrabold bg-transparent border-none outline-none text-stone-900 mb-8 placeholder:text-stone-200 w-full"
                placeholder="Article title…"
              />

              <div
                ref={editorRef}
                contentEditable
                onMouseUp={handleMouseUp}
                onKeyUp={updateCounts}
                onInput={updateCounts}
                suppressContentEditableWarning
                className="text-lg leading-[1.9] text-stone-700 outline-none font-serif min-h-[350px] selection:bg-sage-100"
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
        <div className="shrink-0 border-t border-stone-200 bg-white/90 backdrop-blur-md px-4 md:px-6 h-11 flex items-center justify-between gap-4 z-20">
          <div className="flex items-center gap-0.5">
            <span className="text-[10px] font-bold text-stone-300 uppercase tracking-wider mr-2 hidden md:inline">Format</span>
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
                className="p-1.5 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-all"
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
            <div className="w-px h-4 bg-stone-100 mx-1" />
            {[
              { icon: List, cmd: 'insertUnorderedList', title: 'List' },
              { icon: Quote, cmd: 'formatBlock', title: 'Quote' },
            ].map(({ icon: Icon, cmd, title }) => (
              <button
                key={cmd}
                title={title}
                onMouseDown={(e) => { e.preventDefault(); execFormat(cmd); }}
                className="p-1.5 text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-all"
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
          ${toast.type === 'error' ? 'bg-red-50 text-red-700 border-red-100'
            : toast.type === 'success' ? 'bg-sage-50 text-sage-700 border-sage-100'
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
