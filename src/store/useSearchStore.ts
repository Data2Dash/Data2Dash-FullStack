// ─── Search History Store ─────────────────────────────────────────────────────
// Mirrors the chat session pattern: each search is a "session" with a query
// and its results. "New Search" resets to a blank state; clicking a history
// item restores that session's results instantly (no re-fetch needed).

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SearchSession {
  id: string;          // unique ID (timestamp-based)
  query: string;       // the query string shown in history
  results: any | null; // full SearchResponse — stored so we can restore
  timestamp: number;
}

interface SearchStore {
  // Current active session ID (null = blank/new)
  activeSessionId: string | null;

  // Ordered list of past sessions (most recent first)
  sessions: SearchSession[];

  // Start a brand new blank search
  newSearch: () => void;

  // Save/update results for the active session
  saveResults: (query: string, results: any) => void;

  // Restore a past session by ID; returns its results
  loadSession: (id: string) => SearchSession | undefined;

  // Active session's query + results (convenience selectors)
  activeQuery: string;
  activeResults: any | null;
}

function makeId() {
  return `search_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export const useSearchStore = create<SearchStore>()(
  persist(
    (set, get) => ({
      activeSessionId: null,
      sessions: [],
      activeQuery: '',
      activeResults: null,

      newSearch: () => {
        set({
          activeSessionId: null,
          activeQuery: '',
          activeResults: null,
        });
      },

      saveResults: (query: string, results: any) => {
        const { activeSessionId, sessions } = get();

        if (activeSessionId) {
          // Update existing session
          const updated = sessions.map(s =>
            s.id === activeSessionId ? { ...s, query, results } : s
          );
          set({ sessions: updated, activeQuery: query, activeResults: results });
        } else {
          // Create a new session
          const id = makeId();
          const newSession: SearchSession = {
            id,
            query,
            results,
            timestamp: Date.now(),
          };
          set({
            activeSessionId: id,
            activeQuery: query,
            activeResults: results,
            sessions: [newSession, ...sessions].slice(0, 50), // keep last 50
          });
        }
      },

      loadSession: (id: string) => {
        const { sessions } = get();
        const session = sessions.find(s => s.id === id);
        if (session) {
          set({
            activeSessionId: id,
            activeQuery: session.query,
            activeResults: session.results,
          });
        }
        return session;
      },
    }),
    {
      name: 'data2dash-search-history',
      // Only persist the sessions list and activeSessionId, not transient loading state
      partialize: (state) => ({
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
        activeQuery: state.activeQuery,
        activeResults: state.activeResults,
      }),
    }
  )
);
