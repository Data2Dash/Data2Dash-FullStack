import { create } from 'zustand';

function uuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return uuid();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export interface Message {
  role: 'user' | 'ai';
  content: string;
  sources?: string[];
  equations?: any[];
  tables?: any[];
}

interface ChatStore {
  messages: Message[];
  sessionId: string;
  pdfLoaded: boolean;
  pdfName: string | null;
  refreshTrigger: number;
  addMessage: (msg: Message) => void;
  setMessages: (messages: Message[]) => void;
  setSessionId: (sessionId: string) => void;
  setPdfInfo: (loaded: boolean, name: string | null) => void;
  triggerRefresh: () => void;
  resetChat: () => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  sessionId: uuid(),
  pdfLoaded: false,
  pdfName: null,
  refreshTrigger: 0,
  addMessage: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  setMessages: (messages) => set({ messages }),
  setSessionId: (sessionId) => set({ sessionId }),
  setPdfInfo: (loaded, name) => set({ pdfLoaded: loaded, pdfName: name }),
  triggerRefresh: () => set((s) => ({ refreshTrigger: s.refreshTrigger + 1 })),
  resetChat: () => set({ 
    messages: [], 
    sessionId: uuid(),
    pdfLoaded: false,
    pdfName: null,
    refreshTrigger: 0
  }),
}));
