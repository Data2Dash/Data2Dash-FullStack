import React, { useState, useRef, useEffect } from 'react';
import {
  Menu, X, Sparkles, LogOut, ChevronDown,
  Sun, Moon, Bell, CheckCheck, Trash2,
  CheckCircle2, Info, AlertTriangle, XCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore, logoutWithSave } from '../../store/authStore';
import { useUIStore, type AppNotification, type NotificationType } from '../../store/useUIStore';

// ─── Notification icon by type ────────────────────────────────────────────────

function NotifIcon({ type }: { type: NotificationType }) {
  const cls = 'h-4 w-4 shrink-0';
  if (type === 'success') return <CheckCircle2 className={clsx(cls, 'text-emerald-500')} />;
  if (type === 'warning') return <AlertTriangle className={clsx(cls, 'text-amber-500')} />;
  if (type === 'error')   return <XCircle       className={clsx(cls, 'text-red-500')} />;
  return                         <Info          className={clsx(cls, 'text-blue-500')} />;
}

// ─── Time formatter ───────────────────────────────────────────────────────────

function timeAgo(ts: number) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60)   return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ─── Notification item ────────────────────────────────────────────────────────

function NotifItem({ n, onDismiss, onRead }: {
  n: AppNotification;
  onDismiss: (id: string) => void;
  onRead: (id: string) => void;
}) {
  return (
    <div
      onClick={() => onRead(n.id)}
      className={clsx(
        'group flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors',
        n.read
          ? 'dark:hover:bg-zinc-700/50 hover:bg-stone-50'
          : 'dark:bg-zinc-800 dark:hover:bg-zinc-700/80 bg-blue-50/60 hover:bg-blue-50'
      )}
    >
      <NotifIcon type={n.type} />
      <div className="flex-1 min-w-0">
        <p className={clsx('text-xs font-semibold truncate', n.read ? 'text-stone-500 dark:text-zinc-400' : 'text-stone-900 dark:text-zinc-100')}>
          {n.title}
        </p>
        <p className="text-xs text-stone-500 dark:text-zinc-400 leading-relaxed mt-0.5 line-clamp-2">
          {n.message}
        </p>
        <p className="text-[10px] text-stone-400 dark:text-zinc-500 mt-1">{timeAgo(n.timestamp)}</p>
      </div>
      {!n.read && (
        <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1" />
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(n.id); }}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-stone-200 dark:hover:bg-zinc-600 text-stone-400 dark:text-zinc-500"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

export function Navbar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen]     = useState(false);
  const [isNotifOpen, setIsNotifOpen]           = useState(false);

  const userMenuRef = useRef<HTMLDivElement>(null);
  const notifRef    = useRef<HTMLDivElement>(null);
  const location    = useLocation();
  const navigate    = useNavigate();

  const { user, isAuthenticated, logout } = useAuthStore();
  const {
    isDarkMode, toggleDarkMode,
    notifications, markRead, markAllRead, dismissNotification, clearAllNotifications,
  } = useUIStore();

  const unreadCount = notifications.filter((n) => !n.read).length;

  const isActive = (path: string) => location.pathname === path;

  const navLinks = [
    { name: 'Workspace', path: '/workspace' },
    { name: 'Chat',      path: '/' },
    { name: 'Search',    path: '/search' },
    { name: 'Upload',    path: '/upload' },
    { name: 'Citation',  path: '/citation' },
  ];

  // Close menus on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleLogout = () => {
    logoutWithSave();
    navigate('/login');
  };

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : user?.email?.slice(0, 2).toUpperCase() ?? '??';

  return (
    <nav className="fixed top-0 z-50 w-full bg-white/90 backdrop-blur-md border-b border-stone-100">
      <div className="max-w-6xl mx-auto px-6">
        <div className="flex h-14 items-center justify-between">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-stone-900 dark:bg-zinc-100 text-white dark:text-zinc-900">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="font-semibold text-stone-900 text-sm tracking-tight">
              DATA<span className="text-sage-600">2</span>DASH
            </span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {isAuthenticated && navLinks.map((item) => (
              <Link
                key={item.name}
                to={item.path}
                className={clsx(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200',
                  isActive(item.path)
                    ? 'bg-stone-100 text-stone-900 dark:bg-zinc-800 dark:text-zinc-100'
                    : 'text-stone-500 hover:text-stone-900 hover:bg-stone-50 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800'
                )}
              >
                {item.name}
              </Link>
            ))}

            {/* ── Action buttons ──────────────────────────────────────────── */}
            <div className="flex items-center gap-1 ml-2">

              {/* Dark / Light mode toggle */}
              <button
                onClick={toggleDarkMode}
                title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                className="relative p-2 rounded-xl text-stone-500 hover:text-stone-900 hover:bg-stone-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 transition-all duration-200"
              >
                <span
                  className={clsx(
                    'absolute inset-0 flex items-center justify-center transition-all duration-300',
                    isDarkMode ? 'opacity-0 rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'
                  )}
                >
                  <Moon className="h-4 w-4" />
                </span>
                <span
                  className={clsx(
                    'absolute inset-0 flex items-center justify-center transition-all duration-300',
                    isDarkMode ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'
                  )}
                >
                  <Sun className="h-4 w-4" />
                </span>
                {/* Invisible spacer so button has proper size */}
                <span className="invisible"><Moon className="h-4 w-4" /></span>
              </button>

              {/* Notification bell */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => {
                    setIsNotifOpen(!isNotifOpen);
                    setIsUserMenuOpen(false);
                  }}
                  title="Notifications"
                  className="relative p-2 rounded-xl text-stone-500 hover:text-stone-900 hover:bg-stone-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-zinc-800 transition-all duration-200"
                >
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white px-0.5 leading-none shadow-sm">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>

                {/* Notification dropdown */}
                {isNotifOpen && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-zinc-900 rounded-2xl border border-stone-200 dark:border-zinc-700 shadow-xl z-50 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 dark:border-zinc-800">
                      <div className="flex items-center gap-2">
                        <Bell className="h-4 w-4 text-stone-500 dark:text-zinc-400" />
                        <span className="text-sm font-semibold text-stone-900 dark:text-zinc-100">Notifications</span>
                        {unreadCount > 0 && (
                          <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400 text-[10px] font-bold">
                            {unreadCount} new
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        {unreadCount > 0 && (
                          <button
                            onClick={markAllRead}
                            title="Mark all read"
                            className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-400 dark:text-zinc-500 hover:text-stone-700 dark:hover:text-zinc-300 transition-colors"
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {notifications.length > 0 && (
                          <button
                            onClick={clearAllNotifications}
                            title="Clear all"
                            className="p-1.5 rounded-lg hover:bg-stone-100 dark:hover:bg-zinc-800 text-stone-400 dark:text-zinc-500 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* List */}
                    <div className="max-h-80 overflow-y-auto custom-scrollbar divide-y divide-stone-100 dark:divide-zinc-800">
                      {notifications.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-stone-400 dark:text-zinc-600">
                          <Bell className="h-8 w-8 mb-2 opacity-40" />
                          <p className="text-xs font-medium">No notifications yet</p>
                          <p className="text-[11px] mt-0.5 opacity-70">Completed tasks will appear here</p>
                        </div>
                      ) : (
                        notifications.map((n) => (
                          <NotifItem
                            key={n.id}
                            n={n}
                            onRead={markRead}
                            onDismiss={dismissNotification}
                          />
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* User menu / auth buttons */}
              {isAuthenticated ? (
                <div className="relative ml-1" ref={userMenuRef}>
                  <button
                    onClick={() => { setIsUserMenuOpen(!isUserMenuOpen); setIsNotifOpen(false); }}
                    className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl hover:bg-stone-100 dark:hover:bg-zinc-800 transition-colors group"
                  >
                    {user?.avatar_url ? (
                      <img src={user.avatar_url} alt={user.full_name ?? ''} className="h-7 w-7 rounded-full object-cover" />
                    ) : (
                      <div className="h-7 w-7 rounded-full bg-stone-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center text-xs font-semibold">
                        {initials}
                      </div>
                    )}
                    <span className="text-sm font-medium text-stone-700 dark:text-zinc-300 max-w-[120px] truncate">
                      {user?.full_name ?? user?.email}
                    </span>
                    <ChevronDown className={clsx('h-3.5 w-3.5 text-stone-400 transition-transform', isUserMenuOpen && 'rotate-180')} />
                  </button>

                  {isUserMenuOpen && (
                    <div className="absolute right-0 top-full mt-1.5 w-52 bg-white dark:bg-zinc-900 rounded-xl border border-stone-200 dark:border-zinc-700 shadow-panel py-1 z-50">
                      <div className="px-4 py-2.5 border-b border-stone-100 dark:border-zinc-800">
                        <p className="text-xs font-semibold text-stone-900 dark:text-zinc-100 truncate">{user?.full_name ?? 'User'}</p>
                        <p className="text-xs text-stone-400 dark:text-zinc-500 truncate">{user?.email}</p>
                      </div>
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors rounded-b-xl"
                      >
                        <LogOut className="h-4 w-4" />
                        Sign out
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 ml-1">
                  <Link to="/login" className="px-4 py-2 rounded-lg text-sm font-medium text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100 hover:bg-stone-50 dark:hover:bg-zinc-800 transition-colors">
                    Sign in
                  </Link>
                  <Link to="/signup" className="px-4 py-2 rounded-lg bg-stone-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium hover:bg-stone-700 dark:hover:bg-zinc-200 transition-colors shadow-soft">
                    Sign up
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Mobile Hamburger */}
          <button
            className="md:hidden p-2 rounded-lg hover:bg-stone-100 dark:hover:bg-zinc-800 transition-colors text-stone-600 dark:text-zinc-400"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden border-t border-stone-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 space-y-1">
          {isAuthenticated && navLinks.map((item) => (
            <Link
              key={item.name}
              to={item.path}
              onClick={() => setIsMobileMenuOpen(false)}
              className={clsx(
                'block px-4 py-2.5 rounded-xl text-sm font-medium transition-colors',
                isActive(item.path)
                  ? 'bg-stone-100 dark:bg-zinc-800 text-stone-900 dark:text-zinc-100'
                  : 'text-stone-600 dark:text-zinc-400 hover:bg-stone-50 dark:hover:bg-zinc-800 hover:text-stone-900 dark:hover:text-zinc-100'
              )}
            >
              {item.name}
            </Link>
          ))}
          {/* Mobile theme toggle */}
          <button
            onClick={toggleDarkMode}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-stone-600 dark:text-zinc-400 hover:bg-stone-50 dark:hover:bg-zinc-800 transition-colors"
          >
            {isDarkMode ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {isDarkMode ? 'Light mode' : 'Dark mode'}
          </button>
          {isAuthenticated ? (
            <button onClick={handleLogout} className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          ) : (
            <div className="flex gap-2 pt-1">
              <Link to="/login" onClick={() => setIsMobileMenuOpen(false)} className="flex-1 text-center px-4 py-2.5 rounded-xl text-sm font-medium text-stone-700 dark:text-zinc-300 border border-stone-200 dark:border-zinc-700">Sign in</Link>
              <Link to="/signup" onClick={() => setIsMobileMenuOpen(false)} className="flex-1 text-center px-4 py-2.5 rounded-xl text-sm font-medium bg-stone-900 dark:bg-zinc-100 text-white dark:text-zinc-900">Sign up</Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
