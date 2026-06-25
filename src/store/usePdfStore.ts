// ─── PDF Upload Store — Production Session Management ─────────────────────────
import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface PdfFile {
  id: string;
  name: string;
  size: string;
  status: 'uploading' | 'indexing' | 'ready' | 'error';
  /** Byte-upload progress (0–100) while status === 'uploading'. */
  progress?: number;
  /** Human-readable failure reason when status === 'error'. */
  error?: string;
  /** Detailed progress text from Stage 2 asset extraction. */
  progressText?: string;
  url?: string;
  sessionId: string;
}

type SessionIntent = 'restore' | 'fresh';

interface PdfUploadState {
  files: PdfFile[];
  activeFileId: string | null;
  reindexedSessions: string[];
  chatMessages: Record<string, { role: 'user' | 'ai'; content: string }[]>;
  /** Controls whether hydration from storage is allowed */
  sessionIntent: SessionIntent;

  // Actions
  setFiles: (files: PdfFile[]) => void;
  addFile: (file: PdfFile) => void;
  updateFile: (id: string, updates: Partial<PdfFile>) => void;
  removeFile: (id: string) => void;
  setActiveFileId: (id: string | null) => void;
  markReindexed: (sessionId: string) => void;
  addChatMessage: (fileId: string, msg: { role: 'user' | 'ai'; content: string }) => void;
  setChatMessagesForFile: (fileId: string, msgs: { role: 'user' | 'ai'; content: string }[]) => void;
  restoreSession: (files: PdfFile[], activeFileId: string | null) => void;
  newSession: () => void;
  hardReset: () => void;
}

// ─── Hydration-Gated Storage Adapter ──────────────────────────────────────────
// Reads are blocked when sessionIntent === 'fresh', preventing stale rehydration.
const gatedStorage: StateStorage = {
  getItem: (name: string): string | null => {
    const intentFlag = localStorage.getItem('data2dash-session-intent');
    if (intentFlag === 'fresh') {
      // Block hydration — user requested a clean session
      localStorage.removeItem('data2dash-session-intent');
      localStorage.removeItem(name);
      return null;
    }
    return localStorage.getItem(name);
  },
  setItem: (name: string, value: string) => {
    localStorage.setItem(name, value);
  },
  removeItem: (name: string) => {
    localStorage.removeItem(name);
  },
};

export const usePdfStore = create<PdfUploadState>()(
  persist(
    (set, get) => ({
      files: [],
      activeFileId: null,
      reindexedSessions: [],
      chatMessages: {},
      sessionIntent: 'restore' as SessionIntent,

      setFiles: (files) => set({ files }),
      addFile: (file) => set((s) => ({ files: [...s.files, file] })),
      updateFile: (id, updates) => set((s) => ({
        files: s.files.map((f) => (f.id === id ? { ...f, ...updates } : f)),
      })),
      removeFile: (id) => set((s) => {
        const next = s.files.filter((f) => f.id !== id);
        const newMessages = { ...s.chatMessages };
        delete newMessages[id];
        return {
          files: next,
          chatMessages: newMessages,
          activeFileId:
            s.activeFileId === id
              ? next.length > 0
                ? next[next.length - 1].id
                : null
              : s.activeFileId,
        };
      }),
      setActiveFileId: (id) => set({ activeFileId: id }),
      markReindexed: (sessionId) => set((s) => ({
        reindexedSessions: [...new Set([...s.reindexedSessions, sessionId])],
      })),
      addChatMessage: (fileId, msg) => set((s) => ({
        chatMessages: {
          ...s.chatMessages,
          [fileId]: [...(s.chatMessages[fileId] || []), msg],
        },
      })),
      setChatMessagesForFile: (fileId, msgs) => set((s) => ({
        chatMessages: { ...s.chatMessages, [fileId]: msgs },
      })),
      restoreSession: (files, activeFileId) =>
        set({ files, activeFileId, reindexedSessions: [], chatMessages: {}, sessionIntent: 'restore' }),

      newSession: () => {
        // Set intent flag BEFORE clearing — blocks next hydration cycle
        localStorage.setItem('data2dash-session-intent', 'fresh');
        localStorage.removeItem('data2dash-pdf-upload');

        // Invalidate all active sessions on the backend
        const currentFiles = get().files;
        const sessionIds = [...new Set(currentFiles.map(f => f.sessionId))];
        for (const sid of sessionIds) {
          fetch(`${API_URL}/api/pdf/session/invalidate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sid }),
          }).catch(() => {});
        }

        return set({
          files: [],
          activeFileId: null,
          reindexedSessions: [],
          chatMessages: {},
          sessionIntent: 'fresh',
        });
      },

      hardReset: () => {
        localStorage.setItem('data2dash-session-intent', 'fresh');
        try {
          Object.keys(localStorage).forEach(key => {
            if (key.includes('pdf') || key.includes('session') || key.includes('data2dash')) {
              localStorage.removeItem(key);
            }
          });
        } catch {}

        // Invalidate all sessions server-side
        const currentFiles = get().files;
        const sessionIds = [...new Set(currentFiles.map(f => f.sessionId))];
        for (const sid of sessionIds) {
          fetch(`${API_URL}/api/pdf/session/invalidate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: sid }),
          }).catch(() => {});
        }

        return set({
          files: [],
          activeFileId: null,
          reindexedSessions: [],
          chatMessages: {},
          sessionIntent: 'fresh',
        });
      },
    }),
    {
      name: 'data2dash-pdf-upload',
      storage: createJSONStorage(() => gatedStorage),
      partialize: (state) => ({
        files: state.files.filter((f) => f.status === 'ready'),
        activeFileId: state.activeFileId,
        chatMessages: state.chatMessages,
        sessionIntent: state.sessionIntent,
      }),
    },
  ),
);
