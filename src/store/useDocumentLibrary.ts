// ─── Document Library — backend-synced, localStorage-cached ──────────────────

import { useState, useEffect, useCallback, useRef } from 'react';
import { CitationStyle } from '../api/citationApi';

// Minimal citation shape (avoids circular import with CitationWorkspace)
export interface StoredCitation {
  id: string;
  paperId: string;
  apa: string;
  mla: string;
  chicago: string;
  ieee: string;
  harvard: string;
  bibtex: string;
  source: string;
  pending?: boolean;
}

export interface DocRecord {
  id: string;
  title: string;
  bodyHtml: string;
  citations: StoredCitation[];
  activeStyle: CitationStyle;
  createdAt: string;
  updatedAt: string;
  wordCount: number;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const API_BASE = `${API_URL}/api/documents`;
const cacheKey = (userId: number | null) => `data2dash_docs_${userId ?? 'guest'}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadCache(userId: number | null): DocRecord[] {
  try {
    const raw = localStorage.getItem(cacheKey(userId));
    return raw ? (JSON.parse(raw) as DocRecord[]) : [];
  } catch { return []; }
}

function saveCache(docs: DocRecord[], userId: number | null) {
  try { localStorage.setItem(cacheKey(userId), JSON.stringify(docs)); } catch { /* ignore */ }
}

function makeId() {
  return `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function countWords(html: string) {
  const text = html.replace(/<[^>]*>/g, ' ');
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

// Convert backend snake_case response → DocRecord
function fromApi(d: Record<string, unknown>): DocRecord {
  return {
    id: d.id as string,
    title: d.title as string,
    bodyHtml: d.body_html as string,
    citations: JSON.parse((d.citations_json as string) || '[]') as StoredCitation[],
    activeStyle: (d.active_style as CitationStyle) || 'apa',
    wordCount: (d.word_count as number) || 0,
    createdAt: d.created_at as string,
    updatedAt: d.updated_at as string,
  };
}

// Convert DocRecord → backend payload
function toApi(doc: DocRecord) {
  return {
    id: doc.id,
    title: doc.title,
    body_html: doc.bodyHtml,
    citations_json: JSON.stringify(doc.citations),
    active_style: doc.activeStyle,
    word_count: doc.wordCount,
    created_at: doc.createdAt,
  };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDocumentLibrary(userId: number | null, token: string | null) {
  const [docs, setDocs] = useState<DocRecord[]>(() => loadCache(userId));
  const [syncing, setSyncing] = useState(false);
  const pendingSave = useRef<Set<string>>(new Set());

  // Auth header helper
  const headers = useCallback((): HeadersInit => ({
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }), [token]);

  // ── Re-load from server when user changes ──────────────────────────────────
  useEffect(() => {
    setDocs(loadCache(userId)); // show cache immediately
    if (!token) return;

    setSyncing(true);
    fetch(`${API_BASE}/`, { headers: headers() })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Record<string, unknown>[]) => {
        const serverDocs = data.map(fromApi);
        setDocs(serverDocs);
        saveCache(serverDocs, userId);
      })
      .catch(() => { /* use cache on network error */ })
      .finally(() => setSyncing(false));
  }, [userId, token]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Write-through: persist to backend + cache ──────────────────────────────
  const persistDoc = useCallback(async (doc: DocRecord): Promise<DocRecord> => {
    const updated: DocRecord = {
      ...doc,
      updatedAt: new Date().toISOString(),
      wordCount: countWords(doc.bodyHtml),
    };

    // Update local state immediately
    setDocs((prev) => {
      const exists = prev.find((d) => d.id === doc.id);
      const next = exists
        ? prev.map((d) => (d.id === doc.id ? updated : d))
        : [updated, ...prev];
      saveCache(next, userId);
      return next;
    });

    // Fire-and-forget backend sync (skip if offline/no token)
    if (token && !pendingSave.current.has(doc.id)) {
      pendingSave.current.add(doc.id);
      fetch(`${API_BASE}/`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(toApi(updated)),
      })
        .catch(() => { /* silently keep local version */ })
        .finally(() => pendingSave.current.delete(doc.id));
    }

    return updated;
  }, [userId, token, headers]);

  // ── Create blank document ──────────────────────────────────────────────────
  const createDoc = useCallback((): DocRecord => {
    const now = new Date().toISOString();
    const doc: DocRecord = {
      id: makeId(),
      title: 'Untitled Article',
      bodyHtml: '',
      citations: [],
      activeStyle: 'apa',
      createdAt: now,
      updatedAt: now,
      wordCount: 0,
    };
    persistDoc(doc);
    return doc;
  }, [persistDoc]);

  // ── Upsert (alias for persistDoc for external callers) ────────────────────
  const upsertDoc = useCallback((doc: DocRecord) => persistDoc(doc), [persistDoc]);

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteDoc = useCallback((id: string) => {
    setDocs((prev) => {
      const next = prev.filter((d) => d.id !== id);
      saveCache(next, userId);
      return next;
    });
    if (token) {
      fetch(`${API_BASE}/${id}`, { method: 'DELETE', headers: headers() })
        .catch(() => { /* best-effort */ });
    }
  }, [userId, token, headers]);

  return { docs, syncing, createDoc, upsertDoc, deleteDoc };
}
