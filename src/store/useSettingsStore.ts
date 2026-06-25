import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsStore {
  groqApiKey: string;
  setGroqApiKey: (key: string) => void;
  clearGroqApiKey: () => void;
  isSettingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      groqApiKey: '',
      setGroqApiKey: (key) => set({ groqApiKey: key }),
      clearGroqApiKey: () => set({ groqApiKey: '' }),
      isSettingsOpen: false,
      openSettings: () => set({ isSettingsOpen: true }),
      closeSettings: () => set({ isSettingsOpen: false }),
    }),
    {
      name: 'data2dash-settings',
      partialize: (state) => ({ groqApiKey: state.groqApiKey }),
    }
  )
);
