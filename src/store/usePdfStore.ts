// ─── PDF Upload Store — persists upload sessions across page refreshes ────────
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PdfFile {
  id: string;
  name: string;
  size: string;
  status: 'uploading' | 'ready' | 'error';
  url?: string;
  /** Each file gets its own agent session so it can be chatted with independently */
  sessionId: string;
}

interface PdfUploadState {
  files: PdfFile[];
  activeFileId: string | null;
  /** Tracks which file sessionIds have been re-indexed after a page refresh */
  reindexedSessions: string[];
  /** Chat messages keyed by file id — each file has its own conversation */
  chatMessages: Record<string, { role: 'user' | 'ai'; content: string }[]>;

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
}

export const usePdfStore = create<PdfUploadState>()(
  persist(
    (set) => ({
      files: [],
      activeFileId: null,
      reindexedSessions: [],
      chatMessages: {},

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
        set({ files, activeFileId, reindexedSessions: [], chatMessages: {} }),
      newSession: () =>
        set({
          files: [],
          activeFileId: null,
          reindexedSessions: [],
          chatMessages: {},
        }),
    }),
    {
      name: 'data2dash-pdf-upload',
      partialize: (state) => ({
        files: state.files.filter((f) => f.status === 'ready'),
        activeFileId: state.activeFileId,
        chatMessages: state.chatMessages,
      }),
    },
  ),
);
