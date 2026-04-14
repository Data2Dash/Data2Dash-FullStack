import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthUser {
    id: number;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
    is_active: boolean;
    created_at: string;
}

interface AuthState {
    user: AuthUser | null;
    token: string | null;
    isAuthenticated: boolean;
    setAuth: (user: AuthUser, token: string) => void;
    logout: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            token: null,
            isAuthenticated: false,
            setAuth: (user, token) => set({ user, token, isAuthenticated: true }),
            logout: () => set({ user: null, token: null, isAuthenticated: false }),
        }),
        {
            name: 'data2dash-auth',
        }
    )
);

// ─── Before-logout hook registry ─────────────────────────────────────────────
// Components can register a callback to run (e.g. save) before auth is cleared.
const _beforeLogoutCallbacks = new Set<() => void>();

export function registerBeforeLogout(cb: () => void) {
    _beforeLogoutCallbacks.add(cb);
}

export function unregisterBeforeLogout(cb: () => void) {
    _beforeLogoutCallbacks.delete(cb);
}

/** Call this instead of `logout()` so registered callbacks fire first. */
export function logoutWithSave() {
    _beforeLogoutCallbacks.forEach((cb) => {
        try { cb(); } catch { /* best-effort */ }
    });
    useAuthStore.getState().logout();
}
