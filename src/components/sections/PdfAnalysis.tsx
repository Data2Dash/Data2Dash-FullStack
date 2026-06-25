import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Upload, FileText, Loader2, Plus,
  Download, ExternalLink, X, Sparkles, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { PaperInteractionPanel } from './PaperInteractionPanel';
import { motion, AnimatePresence } from 'framer-motion';
import { clsx } from 'clsx';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/useChatStore';
import { usePdfStore, PdfFile } from '../../store/usePdfStore';
import { uploadApi, validateFile, ACCEPT_ATTR, MAX_FILE_SIZE_MB } from '../../api/uploadApi';
import { notify } from '../../store/useUIStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import axios from 'axios';

/** True when an error is a user-initiated cancellation rather than a real failure. */
function axiosAborted(err: unknown): boolean {
  return axios.isCancel(err) || (err as DOMException)?.name === 'AbortError';
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const SPLIT_KEY = 'data2dash-pdf-split';
const DEFAULT_CHAT_PCT = 42;
const UPLOAD_CONCURRENCY = 3;       // sane parallelism cap for multi-file uploads
const PROGRESS_THROTTLE_MS = 150;   // throttle progress-driven re-renders

// ─── Drag-to-resize hook ──────────────────────────────────────────────────────
function useResizableSplit(defaultPct: number, storageKey: string) {
  const [chatPct, setChatPct] = useState<number>(() => {
    const saved = localStorage.getItem(storageKey);
    return saved ? parseFloat(saved) : defaultPct;
  });
  const dragging = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const onMouseDown = useCallback(() => {
    dragging.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const fromRight = rect.right - e.clientX;
      const pct = Math.min(70, Math.max(25, (fromRight / rect.width) * 100));
      setChatPct(pct);
    };
    const onUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setChatPct(prev => {
        localStorage.setItem(storageKey, String(prev));
        return prev;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [storageKey]);

  return { chatPct, containerRef, onMouseDown };
}

// ─── File Tab Bar ─────────────────────────────────────────────────────────────
// Replaces the left sidebar. Files are shown as horizontal tabs — no scrollbar.
function FileTabBar({
  files,
  activeId,
  onSelect,
  onRemove,
  onCancel,
  onUpload,
}: {
  files: PdfFile[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onCancel: (id: string) => void;
  onUpload: (fl: FileList) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div
      className={clsx(
        'shrink-0 flex items-center gap-0 bg-stone-100 border-b border-stone-200 overflow-x-auto',
        isDragging && 'ring-2 ring-inset ring-stone-400 bg-stone-200',
      )}
      style={{ scrollbarWidth: 'none' }} // hide horizontal scrollbar on tabs
      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={e => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files?.length) onUpload(e.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple
        accept={ACCEPT_ATTR}
        onChange={e => e.target.files?.length && onUpload(e.target.files)}
      />

      {/* File tabs */}
      <div className="flex items-stretch overflow-x-auto flex-1" style={{ scrollbarWidth: 'none' }}>
        <AnimatePresence initial={false}>
          {files.map(file => {
            const isUploading = file.status === 'uploading';
            const isIndexing = file.status === 'indexing';
            // PDF is viewable as soon as bytes land (ready or still indexing).
            const isViewable = file.status === 'ready' || (isIndexing && !!file.url);
            return (
            <motion.button
              key={file.id}
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => isViewable && onSelect(file.id)}
              title={file.status === 'error' ? file.error : file.name}
              className={clsx(
                'group relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-r border-stone-200 transition-all shrink-0 min-w-0 max-w-[200px] overflow-hidden',
                activeId === file.id
                  ? 'bg-white text-stone-900 border-b-2 border-b-stone-900 -mb-px z-10'
                  : file.status === 'error'
                  ? 'text-red-500 hover:bg-red-50'
                  : 'text-stone-500 hover:bg-stone-50 hover:text-stone-800',
              )}
            >
              {isUploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-stone-400" />
              ) : isIndexing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-amber-500" />
              ) : file.status === 'error' ? (
                <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-400" />
              ) : (
                <FileText className="h-3.5 w-3.5 shrink-0" />
              )}

              <span className="truncate max-w-[130px] text-left text-xs">
                {file.name}
              </span>

              {isUploading && (
                <span className="text-[10px] font-bold text-stone-400 shrink-0 tabular-nums">
                  {file.progress ?? 0}%
                </span>
              )}

              {file.status === 'ready' && activeId !== file.id && (
                <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500 opacity-70" />
              )}

              {/* Cancel (in-flight) or Remove (settled) */}
              <span
                role="button"
                onClick={e => {
                  e.stopPropagation();
                  (isUploading || isIndexing) ? onCancel(file.id) : onRemove(file.id);
                }}
                title={isUploading || isIndexing ? 'Cancel upload' : 'Remove'}
                className="ml-0.5 p-0.5 rounded hover:bg-stone-200 text-stone-400 hover:text-stone-700 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              >
                <X className="h-3 w-3" />
              </span>

              {/* Byte-progress bar pinned to the tab's bottom edge */}
              {isUploading && (
                <span
                  className="absolute bottom-0 left-0 h-0.5 bg-stone-800 transition-all duration-150"
                  style={{ width: `${file.progress ?? 0}%` }}
                />
              )}
            </motion.button>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Upload button — always at the right of the tab bar */}
      <button
        onClick={() => inputRef.current?.click()}
        className="shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold text-stone-500 hover:text-stone-900 hover:bg-stone-200 transition-colors border-l border-stone-200 h-full"
        title="Upload more files"
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">Add file</span>
      </button>
    </div>
  );
}

// ─── PDF Viewer Panel ─────────────────────────────────────────────────────────
function PdfViewer({ file }: { file: PdfFile | null }) {
  return (
    <div className="flex-1 flex flex-col min-w-0 bg-stone-100 overflow-hidden">
      {file?.url ? (
        <>
          {/* Minimal floating toolbar */}
          <div className="shrink-0 h-10 flex items-center gap-2 px-3 bg-white/80 backdrop-blur-sm border-b border-stone-200">
            <span className="text-xs text-stone-500 truncate flex-1">{file.name}</span>
            <a
              href={file.url}
              download
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-500 text-[11px] font-semibold transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
            </a>
            <a
              href={file.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-500 text-[11px] font-semibold transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
          <iframe
            key={file.url}
            src={file.url}
            className="flex-1 w-full border-none"
            title="PDF viewer"
          />
        </>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-stone-400">
          <FileText className="h-14 w-14 opacity-10" />
          <div className="text-center">
            <p className="text-sm font-semibold text-stone-500">No document open</p>
            <p className="text-xs text-stone-400 mt-0.5">Click a tab above to view</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export function PdfAnalysis() {
  const {
    files, activeFileId, reindexedSessions,
    addFile, updateFile, removeFile, setActiveFileId,
    markReindexed, addChatMessage, chatMessages, setChatMessagesForFile,
    hardReset,
  } = usePdfStore();

  const [reindexing, setReindexing] = useState(false);

  const { token } = useAuthStore();
  const { triggerRefresh } = useChatStore();
  const { chatPct, containerRef, onMouseDown } = useResizableSplit(DEFAULT_CHAT_PCT, SPLIT_KEY);

  const currentFile = files.find(f => f.id === activeFileId) ?? null;

  // ── In-flight request bookkeeping (mirrors the cancellation pattern an
  //    AbortController-based data layer needs; Search has none so this diverges).
  //    Kept in refs — transient, never persisted. ──────────────────────────────
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  const lastProgressEmit = useRef<Map<string, number>>(new Map());

  // Abort every in-flight upload/poll on unmount so no resources or listeners leak.
  useEffect(() => {
    return () => {
      abortControllers.current.forEach(ac => ac.abort());
      abortControllers.current.clear();
      lastProgressEmit.current.clear();
    };
  }, []);

  // Throttle progress-driven store writes so rapid byte events don't thrash renders.
  const emitProgress = useCallback((id: string, pct: number) => {
    const now = Date.now();
    const last = lastProgressEmit.current.get(id) ?? 0;
    if (pct < 100 && now - last < PROGRESS_THROTTLE_MS) return;
    lastProgressEmit.current.set(id, now);
    updateFile(id, { progress: pct });
  }, [updateFile]);

  // ── Auto-reindex persisted files on mount / page refresh ──────────────────
  useEffect(() => {
    if (files.length === 0) return;
    const filesToReindex = files.filter(f => f.status === 'ready' && f.url && !reindexedSessions.includes(f.sessionId));
    if (filesToReindex.length === 0) return;

    // Re-index ALL unindexed ready files so the agent can chat with them
    const doReindex = async () => {
      setReindexing(true);
      for (const file of filesToReindex) {
        try {
          await fetch(`${API_URL}/api/pdf/reindex`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: file.sessionId, filename: file.name }),
          });
          markReindexed(file.sessionId);
        } catch (err) {
          console.warn('Reindex failed for', file.name, err);
        }
      }
      setReindexing(false);
    };
    doReindex();
  }, [files, reindexedSessions, markReindexed]);

  // Upload + index one file end-to-end. Each phase is cancellable via its
  // AbortController; transient failures retry with backoff inside uploadApi.
  const uploadOne = useCallback(async (file: File, entry: PdfFile) => {
    const ac = new AbortController();
    abortControllers.current.set(entry.id, ac);
    try {
      const data = await uploadApi.uploadFile({
        file,
        sessionId: entry.sessionId,
        token,
        signal: ac.signal,
        onProgress: pct => emitProgress(entry.id, pct),
      });

      updateFile(entry.id, { url: data.url, progress: 100 });
      // Optimistic: reveal the PDF viewer the moment bytes have landed.
      if (!usePdfStore.getState().activeFileId) setActiveFileId(entry.id);
      triggerRefresh();

      if (data.indexing) {
        // Background-index phase — non-blocking; viewer already usable.
        updateFile(entry.id, { status: 'indexing' });
        const result = await uploadApi.pollIndexingStatus({
          sessionId: entry.sessionId,
          fileName: file.name,
          signal: ac.signal,
          onProgress: (progress, assets) => {
            const parts = [progress];
            if (assets && (assets.equations || assets.tables || assets.figures)) {
              parts.push(`(${assets.tables} tables, ${assets.equations} eq, ${assets.figures} fig)`);
            }
            updateFile(entry.id, { progressText: parts.join(' ') });
          },
        });
        if (result === 'error') {
          updateFile(entry.id, { status: 'error', error: 'Indexing failed — the file may be corrupted or protected.' });
          notify('Indexing Failed', `"${file.name}" was uploaded but could not be indexed.`, 'error');
        } else {
          updateFile(entry.id, { status: 'ready' });
          markReindexed(entry.sessionId);
          triggerRefresh();
        }
      } else {
        updateFile(entry.id, { status: 'ready' });
        markReindexed(entry.sessionId);
      }
    } catch (err) {
      // Swallow user-initiated cancellation; surface real failures.
      if (axiosAborted(err)) return;
      const msg = err instanceof Error ? err.message : 'Upload failed.';
      updateFile(entry.id, { status: 'error', error: msg });
      notify('Upload Failed', `"${file.name}": ${msg}`, 'error');
    } finally {
      abortControllers.current.delete(entry.id);
      lastProgressEmit.current.delete(entry.id);
    }
  }, [token, emitProgress, updateFile, setActiveFileId, triggerRefresh, markReindexed]);

  const processFiles = useCallback(async (fileList: FileList | File[]) => {
    const arr = Array.from(fileList);

    // Fail-fast client-side validation — reject bad files before any bandwidth.
    const accepted: { file: File; entry: PdfFile }[] = [];
    for (const f of arr) {
      const sizeStr = (f.size / (1024 * 1024)).toFixed(1) + ' MB';
      const sessionId = crypto.randomUUID();
      const base: Omit<PdfFile, 'status'> = {
        id: `${f.name}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: f.name,
        size: sizeStr,
        sessionId,
      };
      const validationError = validateFile(f);
      if (validationError) {
        addFile({ ...base, status: 'error', error: validationError });
        notify('File Rejected', `"${f.name}": ${validationError}`, 'error');
        continue;
      }
      const entry: PdfFile = { ...base, status: 'uploading', progress: 0 };
      addFile(entry);
      accepted.push({ file: f, entry });
    }

    // Bounded-concurrency worker pool — parallel uploads with a sane cap so we
    // don't open one connection per dropped file. Each worker drains the queue.
    let cursor = 0;
    const worker = async () => {
      while (cursor < accepted.length) {
        const job = accepted[cursor++];
        await uploadOne(job.file, job.entry);
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(UPLOAD_CONCURRENCY, accepted.length) }, worker),
    );
  }, [addFile, uploadOne]);

  // Cancel an in-flight upload and drop its placeholder.
  const cancelUpload = useCallback((id: string) => {
    abortControllers.current.get(id)?.abort();
    abortControllers.current.delete(id);
    removeFile(id);
  }, [removeFile]);

  const handleRemoveFile = useCallback((id: string) => {
    abortControllers.current.get(id)?.abort();
    abortControllers.current.delete(id);
    removeFile(id);
  }, [removeFile]);

  const handleHardReset = useCallback(() => {
    hardReset();
    triggerRefresh();
  }, [hardReset, triggerRefresh]);

  // ── Empty state ──────────────────────────────────────────────────────────────
  if (files.length === 0) {
    return <EmptyState onUpload={processFiles} onHardReset={handleHardReset} />;
  }

  // ── Workspace ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden bg-stone-50">

      {/* ── File Tab Bar (replaces the left sidebar) ────────────────────────── */}
      <FileTabBar
        files={files}
        activeId={activeFileId}
        onSelect={setActiveFileId}
        onRemove={handleRemoveFile}
        onCancel={cancelUpload}
        onUpload={processFiles}
      />

      {/* Re-indexing banner */}
      {reindexing && (
        <div className="shrink-0 flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs font-semibold">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Re-indexing documents for chat…
        </div>
      )}

      {/* ── Main split: PDF | Chat ──────────────────────────────────────────── */}
      <div ref={containerRef} className="flex flex-1 overflow-hidden">

        {/* PDF Viewer */}
        <PdfViewer file={currentFile} />

        {/* Drag Handle */}
        <div
          onMouseDown={onMouseDown}
          className="w-1 shrink-0 bg-stone-200 hover:bg-stone-400 active:bg-stone-500 cursor-col-resize transition-colors relative group"
          title="Drag to resize"
        >
          <div className="absolute inset-y-0 -left-1 -right-1" /> {/* wider hit area */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-8 w-1 rounded-full bg-stone-400 group-hover:bg-stone-600 transition-colors" />
        </div>

        {/* AI Chat + Tools */}
        <div
          className="shrink-0 flex flex-col bg-white border-l border-stone-200 overflow-hidden"
          style={{ width: `${chatPct}%` }}
        >
          <PaperInteractionPanel
            title={currentFile?.name ?? 'Document Chat'}
            subtitle={
              currentFile?.status === 'uploading'
                ? `Uploading… ${currentFile.progress ?? 0}%`
                : currentFile?.status === 'indexing'
                ? (currentFile.progressText || 'Indexing for chat…')
                : currentFile?.status === 'error'
                ? (currentFile.error ?? 'Upload failed')
                : currentFile
                ? `${currentFile.size} · ready`
                : 'Upload a PDF to start'
            }
            sessionId={currentFile?.sessionId ?? 'default'}
            fileName={currentFile?.status === 'ready' ? currentFile.name : null}
            pdfUrl={currentFile?.url}
            chatHistory={currentFile ? chatMessages[currentFile.id] : undefined}
            availableFilesToCompare={files.map(f => ({ id: f.id, name: f.name, sessionId: f.sessionId }))}
            initialMessage={
              currentFile ? (
                currentFile.status === 'error' ? (
                  <div className="flex items-start gap-3 bg-red-50 p-4 rounded-xl border border-red-200">
                    <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-red-800 font-bold text-sm mb-1">Upload failed</p>
                      <p className="text-red-700 text-xs leading-relaxed">{currentFile.error}</p>
                    </div>
                  </div>
                ) : currentFile.status === 'uploading' || currentFile.status === 'indexing' ? (
                  <div className="flex items-center gap-3 bg-amber-50 p-4 rounded-xl border border-amber-200">
                    <Loader2 className="h-5 w-5 animate-spin text-amber-600 shrink-0" />
                    <span className="text-amber-800 font-semibold text-sm">
                      {currentFile.status === 'uploading'
                        ? <>Uploading <strong>{currentFile.name}</strong>… {currentFile.progress ?? 0}%</>
                        : <>{currentFile.progressText || <>Indexing <strong>{currentFile.name}</strong> for chat…</>}</>}
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-emerald-700 bg-emerald-50 px-3 py-2 rounded-lg border border-emerald-200 text-xs font-semibold">
                      ✅ <span>{currentFile.name} indexed — tables, equations & figures available</span>
                    </div>
                    <p className="text-sm text-stone-700">
                      Ready to analyse <strong>{currentFile.name}</strong>. Ask me anything about its content, methodology, figures, or equations.
                    </p>
                  </div>
                )
              ) : (
                <div className="flex items-center gap-3 text-stone-500">
                  <Sparkles className="h-5 w-5 text-stone-400 shrink-0" />
                  <span className="text-sm">Open a document from the tab bar to start chatting.</span>
                </div>
              )
            }
            onSendMessage={async (message) => {
              if (!currentFile) return { response: '⚠️ No document selected.' };
              const headers: Record<string, string> = { 'Content-Type': 'application/json' };
              if (token) headers['Authorization'] = `Bearer ${token}`;
              const userGroqKey = useSettingsStore.getState().groqApiKey;
              if (userGroqKey) headers['x-groq-api-key'] = userGroqKey;
              const res = await fetch(`${API_URL}/api/pdf/chat`, {
                method: 'POST',
                headers,
                body: JSON.stringify({ query: message, session_id: currentFile.sessionId }),
              });
              if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                return {
                  response: errData.detail
                    ? `⚠️ ${errData.detail}`
                    : `⚠️ Server error (${res.status}). Please try again.`,
                };
              }
              const data = await res.json();
              if (!data.answer && !data.response) {
                return { response: '⚠️ No PDF uploaded yet or the document has not been indexed. Please wait a moment and try again.' };
              }
              const response = data.answer || data.response || '';
              // Persist chat messages to the store for this specific file
              addChatMessage(currentFile.id, { role: 'user', content: message });
              addChatMessage(currentFile.id, { role: 'ai', content: response });
              return {
                response,
                sources: data.sources,
                equations: data.equations,
                tables: data.tables,
              };
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────────────────────────
function EmptyState({ onUpload, onHardReset }: { onUpload: (fl: FileList) => void; onHardReset?: () => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col items-center justify-center px-6 bg-white">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl text-center"
      >
        <div className="inline-flex p-5 rounded-3xl bg-stone-100 mb-6">
          <FileText className="h-10 w-10 text-stone-600" />
        </div>
        <h1 className="text-4xl font-extrabold text-stone-900 mb-3 tracking-tight">PDF Analysis</h1>
        <p className="text-stone-500 text-lg mb-10 max-w-md mx-auto">
          Upload documents and instantly chat with them using AI — extract tables, equations, figures and more.
        </p>

        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={e => { e.preventDefault(); setIsDragging(false); if (e.dataTransfer.files?.length) onUpload(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={clsx(
            'w-full rounded-3xl border-2 border-dashed p-16 flex flex-col items-center gap-4 cursor-pointer transition-all duration-200',
            isDragging
              ? 'border-stone-600 bg-stone-100 scale-[1.01]'
              : 'border-stone-200 bg-stone-50 hover:border-stone-400 hover:bg-stone-100',
          )}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            multiple
            accept={ACCEPT_ATTR}
            onChange={e => e.target.files?.length && onUpload(e.target.files)}
          />
          <div className={clsx('p-4 rounded-2xl transition-colors', isDragging ? 'bg-stone-200' : 'bg-white border border-stone-200 shadow-sm')}>
            <Upload className="h-8 w-8 text-stone-600" />
          </div>
          <div>
            <p className="font-bold text-stone-800 text-lg mb-1">
              {isDragging ? 'Release to upload' : 'Drop files here or click to browse'}
            </p>
            <p className="text-sm text-stone-400">PDF, DOCX, TXT · up to {MAX_FILE_SIZE_MB} MB · multiple files supported</p>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mt-8">
          {['Chat with documents', 'Extract tables', 'Render equations', 'Generate quizzes', 'Knowledge graphs', 'Audio summaries'].map(f => (
            <span key={f} className="px-3 py-1.5 rounded-full bg-stone-100 text-stone-600 text-xs font-semibold border border-stone-200">
              {f}
            </span>
          ))}
        </div>

        {onHardReset && (
          <button
            onClick={onHardReset}
            className="mt-6 px-4 py-2 text-xs font-medium text-stone-400 hover:text-red-500 hover:bg-red-50 rounded-lg border border-stone-200 transition-colors"
          >
            Hard Reset (Clear all sessions)
          </button>
        )}
      </motion.div>
    </div>
  );
}
