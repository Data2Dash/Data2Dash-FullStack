import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ─── Notification ─────────────────────────────────────────────────────────────

export type NotificationType = 'success' | 'info' | 'warning' | 'error';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: NotificationType;
  timestamp: number; // Date.now()
  read: boolean;
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface UIStore {
  // Sidebar
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;

  // Theme
  isDarkMode: boolean;
  toggleDarkMode: () => void;
  setDarkMode: (dark: boolean) => void;

  // Notifications
  notifications: AppNotification[];
  pushNotification: (n: Omit<AppNotification, 'id' | 'timestamp' | 'read'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismissNotification: (id: string) => void;
  clearAllNotifications: () => void;
}

// ─── Store implementation ─────────────────────────────────────────────────────

export const useUIStore = create<UIStore>()(
  persist(
    (set) => ({
      // Sidebar
      isSidebarOpen: true,
      toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
      setSidebarOpen: (open) => set({ isSidebarOpen: open }),

      // Theme
      isDarkMode: false,
      toggleDarkMode: () =>
        set((s) => {
          const next = !s.isDarkMode;
          if (next) document.documentElement.classList.add('dark');
          else document.documentElement.classList.remove('dark');
          return { isDarkMode: next };
        }),
      setDarkMode: (dark) =>
        set(() => {
          if (dark) document.documentElement.classList.add('dark');
          else document.documentElement.classList.remove('dark');
          return { isDarkMode: dark };
        }),

      // Notifications
      notifications: [],
      pushNotification: (n) =>
        set((s) => ({
          notifications: [
            {
              ...n,
              id: `notif-${Date.now()}-${Math.random().toString(36).slice(2)}`,
              timestamp: Date.now(),
              read: false,
            },
            ...s.notifications,
          ].slice(0, 50), // keep last 50
        })),
      markRead: (id) =>
        set((s) => ({
          notifications: s.notifications.map((n) =>
            n.id === id ? { ...n, read: true } : n
          ),
        })),
      markAllRead: () =>
        set((s) => ({
          notifications: s.notifications.map((n) => ({ ...n, read: true })),
        })),
      dismissNotification: (id) =>
        set((s) => ({
          notifications: s.notifications.filter((n) => n.id !== id),
        })),
      clearAllNotifications: () => set({ notifications: [] }),
    }),
    { name: 'data2dash-ui' }
  )
);

// ─── Convenience helper (use anywhere without hooks) ─────────────────────────

export function notify(
  title: string,
  message: string,
  type: NotificationType = 'info'
) {
  useUIStore.getState().pushNotification({ title, message, type });
}
