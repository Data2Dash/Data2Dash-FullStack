import { create } from 'zustand';

interface CitationStore {
  pendingOpenDocId: string | null;
  setPendingOpenDocId: (id: string | null) => void;
}

export const useCitationStore = create<CitationStore>((set) => ({
  pendingOpenDocId: null,
  setPendingOpenDocId: (id) => set({ pendingOpenDocId: id }),
}));
