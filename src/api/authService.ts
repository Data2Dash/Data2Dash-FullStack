const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const BASE = `${API_URL}/auth`;

export interface AuthUser {
    id: number;
    email: string;
    full_name: string | null;
    avatar_url: string | null;
    is_active: boolean;
    created_at: string;
}

export interface TokenResponse {
    access_token: string;
    token_type: string;
    user: AuthUser;
}

export async function apiRegister(email: string, password: string, full_name?: string): Promise<TokenResponse> {
    const res = await fetch(`${BASE}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, full_name }),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Registration failed');
    }
    return res.json();
}

export async function apiLogin(email: string, password: string): Promise<TokenResponse> {
    const res = await fetch(`${BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Login failed');
    }
    return res.json();
}

export async function apiGetMe(token: string): Promise<AuthUser> {
    const res = await fetch(`${BASE}/me`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Not authenticated');
    return res.json();
}

export function googleAuthUrl(): string {
    return `${API_URL}/auth/google`;
}
