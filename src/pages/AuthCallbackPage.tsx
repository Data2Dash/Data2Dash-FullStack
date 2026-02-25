import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { apiGetMe } from '../api/authService';

/**
 * Google OAuth redirects to /auth/callback#token=<JWT>
 * This page reads the token from the URL hash and stores it.
 */
export function AuthCallbackPage() {
    const navigate = useNavigate();
    const setAuth = useAuthStore((s) => s.setAuth);

    useEffect(() => {
        const hash = window.location.hash; // e.g. "#token=eyJ..."
        const params = new URLSearchParams(hash.replace('#', '?'));
        const token = params.get('token');

        if (!token) {
            navigate('/login');
            return;
        }

        apiGetMe(token)
            .then((user) => {
                setAuth(user, token);
                navigate('/');
            })
            .catch(() => {
                navigate('/login');
            });
    }, []);

    return (
        <div className="min-h-screen bg-stone-50 flex items-center justify-center">
            <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-stone-400 mx-auto mb-3" />
                <p className="text-sm text-stone-500">Completing sign-in…</p>
            </div>
        </div>
    );
}
