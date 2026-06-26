import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Sparkles, Mail, Lock, User, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { apiRegister, googleAuthUrl } from '../api/authService';
import { useAuthStore } from '../store/authStore';

export function SignupPage() {
    const navigate = useNavigate();
    const setAuth = useAuthStore((s) => s.setAuth);

    const [fullName, setFullName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (password.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const data = await apiRegister(email, password, fullName || undefined);
            setAuth(data.user, data.access_token);
            navigate('/');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Registration failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-stone-50 dark:bg-zinc-950 flex items-center justify-center px-4 py-16">
            <div className="w-full max-w-sm">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center gap-2 mb-6">
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-stone-900 dark:bg-zinc-100 text-white dark:text-zinc-900">
                            <Sparkles className="h-4 w-4" />
                        </div>
                        <span className="font-semibold text-stone-900 dark:text-zinc-100 text-lg">
                            DATA<span className="text-sage-600 dark:text-emerald-400">2</span>DASH
                        </span>
                    </div>
                    <h1 className="text-2xl font-bold text-stone-900 dark:text-zinc-100 mb-1">Create an account</h1>
                    <p className="text-stone-500 dark:text-zinc-400 text-sm">Start your research journey</p>
                </div>

                {/* Card */}
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-stone-200 dark:border-zinc-700 shadow-soft p-6">
                    {/* Google Button */}
                    <a
                        href={googleAuthUrl()}
                        className="flex items-center justify-center gap-3 w-full h-10 rounded-xl border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 hover:bg-stone-50 dark:hover:bg-zinc-700 text-sm font-medium text-stone-700 dark:text-zinc-300 transition-colors mb-4 shadow-soft"
                    >
                        <svg className="h-4 w-4" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        Continue with Google
                    </a>

                    <div className="relative mb-4">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-stone-100 dark:border-zinc-800" />
                        </div>
                        <div className="relative flex justify-center text-xs">
                            <span className="bg-white dark:bg-zinc-900 px-3 text-stone-400 dark:text-zinc-500">or sign up with email</span>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-4 flex items-center gap-2 rounded-xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 px-4 py-3 text-sm text-red-600 dark:text-red-400">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-3">
                        <div>
                            <label className="block text-xs font-medium text-stone-600 dark:text-zinc-400 mb-1.5">Full name <span className="text-stone-400 dark:text-zinc-500">(optional)</span></label>
                            <div className="relative">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 dark:text-zinc-500" />
                                <input
                                    type="text"
                                    autoComplete="name"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    className="w-full h-10 rounded-xl border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 pl-9 pr-4 text-sm text-stone-900 dark:text-zinc-100 placeholder:text-stone-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-stone-400 dark:focus:ring-zinc-600 transition-all"
                                    placeholder="Jane Doe"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-stone-600 dark:text-zinc-400 mb-1.5">Email</label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 dark:text-zinc-500" />
                                <input
                                    type="email"
                                    required
                                    autoComplete="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full h-10 rounded-xl border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 pl-9 pr-4 text-sm text-stone-900 dark:text-zinc-100 placeholder:text-stone-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-stone-400 dark:focus:ring-zinc-600 transition-all"
                                    placeholder="you@example.com"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-stone-600 dark:text-zinc-400 mb-1.5">Password</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 dark:text-zinc-500" />
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    autoComplete="new-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full h-10 rounded-xl border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 pl-9 pr-10 text-sm text-stone-900 dark:text-zinc-100 placeholder:text-stone-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-stone-400 dark:focus:ring-zinc-600 transition-all"
                                    placeholder="8+ characters"
                                />
                                <button type="button" onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-zinc-500 hover:text-stone-600 dark:hover:text-zinc-300">
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full h-10 rounded-xl bg-stone-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium hover:bg-stone-700 dark:hover:bg-zinc-300 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 mt-2"
                        >
                            {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Creating account…</> : 'Create account'}
                        </button>
                    </form>
                </div>

                <p className="text-center text-sm text-stone-500 dark:text-zinc-400 mt-5">
                    Already have an account?{' '}
                    <Link to="/login" className="font-medium text-stone-900 dark:text-zinc-100 hover:underline">Sign in</Link>
                </p>
            </div>
        </div>
    );
}
