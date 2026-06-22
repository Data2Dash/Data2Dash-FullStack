import React, { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Sun, Moon, Bell, CheckCheck, Trash2, X,
  CheckCircle2, Info, AlertTriangle, XCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useUIStore, type NotificationType } from '../../store/useUIStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PAGE_TITLES: Record<string, string> = {
  '/':          'Chat',
  '/workspace': 'Workspace',
  '/search':    'Search',
  '/upload':    'Upload',
  '/citation':  'Citations',
};

function typeIcon(type: NotificationType) {
  const base = 'h-4 w-4 shrink-0';
  if (type === 'success') return <CheckCircle2 className={clsx(base, 'text-emerald-500')} />;
  if (type === 'warning') return <AlertTriangle className={clsx(base, 'text-amber-500')} />;
  if (type === 'error')   return <XCircle       className={clsx(base, 'text-red-500')} />;
  return                         <Info          className={clsx(base, 'text-blue-500')} />;
}

function timeAgo(ts: number) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60)    return 'just now';
  if (s < 3600)  return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ─── TopBar ───────────────────────────────────────────────────────────────────

export function TopBar() {
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] ?? '';

  const {
    isDarkMode, toggleDarkMode,
    notifications, markRead, markAllRead,
    dismissNotification, clearAllNotifications,
  } = useUIStore();

  const unread = notifications.filter(n => !n.read).length;
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  return (
    <header className="h-12 shrink-0 flex items-center justify-between px-5 border-b border-stone-200 bg-white/80 backdrop-blur-sm z-40">
      {/* Page title */}
      <span className="text-sm font-semibold text-stone-700 tracking-tight select-none">
        {title}
      </span>

      {/* Right-side actions */}
      <div className="flex items-center gap-1">

        {/* ── Dark / Light mode toggle ─────────────────────────────── */}
        <button
          onClick={toggleDarkMode}
          title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
          className="relative w-9 h-9 flex items-center justify-center rounded-xl text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-all duration-200"
        >
          <span className={clsx(
            'absolute inset-0 flex items-center justify-center transition-all duration-300',
            isDarkMode ? 'opacity-0 rotate-90 scale-50' : 'opacity-100 rotate-0 scale-100'
          )}>
            <Moon className="h-[18px] w-[18px]" />
          </span>
          <span className={clsx(
            'absolute inset-0 flex items-center justify-center transition-all duration-300',
            isDarkMode ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 -rotate-90 scale-50'
          )}>
            <Sun className="h-[18px] w-[18px]" />
          </span>
        </button>

        {/* ── Notification bell ────────────────────────────────────── */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(v => !v)}
            title="Notifications"
            className="relative w-9 h-9 flex items-center justify-center rounded-xl text-stone-500 hover:text-stone-900 hover:bg-stone-100 transition-all duration-200"
          >
            <Bell className="h-[18px] w-[18px]" />
            {unread > 0 && (
              <span className="absolute top-1 right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white px-0.5 leading-none shadow-sm">
                {unread > 99 ? '99+' : unread}
              </span>
            )}
          </button>

          {/* ── Notification panel ──────────────────────────────── */}
          {notifOpen && (
            <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl border border-stone-200 shadow-xl z-[300] overflow-hidden">

              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
                <div className="flex items-center gap-2">
                  <Bell className="h-3.5 w-3.5 text-stone-400" />
                  <span className="text-xs font-bold text-stone-900 uppercase tracking-wider">
                    Notifications
                  </span>
                  {unread > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 text-[10px] font-bold">
                      {unread} new
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-0.5">
                  {unread > 0 && (
                    <button
                      onClick={markAllRead}
                      title="Mark all read"
                      className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors"
                    >
                      <CheckCheck className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {notifications.length > 0 && (
                    <button
                      onClick={clearAllNotifications}
                      title="Clear all"
                      className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* List */}
              <div className="max-h-[360px] overflow-y-auto custom-scrollbar divide-y divide-stone-100">
                {notifications.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-stone-400">
                    <div className="w-12 h-12 rounded-2xl bg-stone-100 flex items-center justify-center mb-3">
                      <Bell className="h-6 w-6 opacity-40" />
                    </div>
                    <p className="text-xs font-semibold text-stone-500">No notifications yet</p>
                    <p className="text-[11px] mt-1 text-stone-400">Completed tasks will appear here</p>
                  </div>
                ) : (
                  notifications.map(n => (
                    <div
                      key={n.id}
                      onClick={() => markRead(n.id)}
                      className={clsx(
                        'group flex items-start gap-3 px-4 py-3.5 cursor-pointer transition-colors',
                        n.read ? 'hover:bg-stone-50' : 'bg-blue-50/60 hover:bg-blue-50'
                      )}
                    >
                      <div className="mt-0.5 shrink-0">{typeIcon(n.type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className={clsx(
                          'text-xs font-semibold truncate',
                          n.read ? 'text-stone-500' : 'text-stone-900'
                        )}>
                          {n.title}
                        </p>
                        <p className="text-xs text-stone-500 leading-relaxed mt-0.5 line-clamp-2">
                          {n.message}
                        </p>
                        <p className="text-[10px] text-stone-400 mt-1">{timeAgo(n.timestamp)}</p>
                      </div>
                      {!n.read && (
                        <div className="h-2 w-2 rounded-full bg-blue-500 shrink-0 mt-1.5" />
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); dismissNotification(n.id); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-stone-200 text-stone-400 shrink-0 ml-1"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
