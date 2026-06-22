import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Info, AlertTriangle, XCircle, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useUIStore, type AppNotification, type NotificationType } from '../../store/useUIStore';

// ─── Config ───────────────────────────────────────────────────────────────────
const TOAST_DURATION_MS = 5000;
const MAX_VISIBLE_TOASTS = 4;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function typeStyles(type: NotificationType) {
  switch (type) {
    case 'success': return {
      bar:  'bg-emerald-500',
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />,
    };
    case 'warning': return {
      bar:  'bg-amber-500',
      icon: <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />,
    };
    case 'error': return {
      bar:  'bg-red-500',
      icon: <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />,
    };
    default: return {
      bar:  'bg-blue-500',
      icon: <Info className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />,
    };
  }
}

// ─── Single Toast ─────────────────────────────────────────────────────────────
interface ToastItemProps {
  notification: AppNotification;
  onDismiss: (id: string) => void;
}

function ToastItem({ notification: n, onDismiss }: ToastItemProps) {
  const [visible, setVisible] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = () => {
    setLeaving(true);
    setTimeout(() => onDismiss(n.id), 300);
  };

  useEffect(() => {
    // Animate in
    const frame = requestAnimationFrame(() => setVisible(true));
    // Auto-dismiss
    timerRef.current = setTimeout(dismiss, TOAST_DURATION_MS);
    return () => {
      cancelAnimationFrame(frame);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const { bar, icon } = typeStyles(n.type);

  return (
    <div
      className={clsx(
        'relative flex items-start gap-3 w-80 bg-white rounded-2xl shadow-xl border border-stone-100 p-4 overflow-hidden',
        'transition-all duration-300 ease-out',
        visible && !leaving
          ? 'opacity-100 translate-x-0'
          : 'opacity-0 translate-x-8'
      )}
      onMouseEnter={() => { if (timerRef.current) clearTimeout(timerRef.current); }}
      onMouseLeave={() => { timerRef.current = setTimeout(dismiss, 2000); }}
    >
      {/* Colored left bar */}
      <div className={clsx('absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl', bar)} />

      {icon}

      <div className="flex-1 min-w-0 pl-1">
        <p className="text-xs font-bold text-stone-900 leading-snug">{n.title}</p>
        <p className="text-xs text-stone-500 leading-relaxed mt-0.5 line-clamp-2">{n.message}</p>
      </div>

      <button
        onClick={dismiss}
        className="shrink-0 p-0.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      {/* Progress bar */}
      <div
        className={clsx('absolute bottom-0 left-0 right-0 h-0.5', bar, 'opacity-30')}
        style={{
          animation: `toast-progress ${TOAST_DURATION_MS}ms linear forwards`,
        }}
      />
    </div>
  );
}

// ─── Toast Container ──────────────────────────────────────────────────────────
export function ToastContainer() {
  const { notifications, markRead } = useUIStore();

  // Keep a local set of IDs we've already shown so we don't re-toast old ones
  const shownIds = useRef<Set<string>>(new Set());
  const [activeToasts, setActiveToasts] = useState<AppNotification[]>([]);

  useEffect(() => {
    const freshOnes = notifications.filter(n => !shownIds.current.has(n.id));
    if (freshOnes.length === 0) return;

    freshOnes.forEach(n => shownIds.current.add(n.id));

    setActiveToasts(prev => {
      const combined = [...freshOnes.reverse(), ...prev];
      return combined.slice(0, MAX_VISIBLE_TOASTS);
    });
  }, [notifications]);

  const dismiss = (id: string) => {
    markRead(id);
    setActiveToasts(prev => prev.filter(n => n.id !== id));
  };

  if (activeToasts.length === 0) return null;

  return (
    <div
      className="fixed top-4 right-4 flex flex-col gap-2 z-[9999] pointer-events-none"
      aria-live="polite"
    >
      {activeToasts.map(n => (
        <div key={n.id} className="pointer-events-auto">
          <ToastItem notification={n} onDismiss={dismiss} />
        </div>
      ))}
    </div>
  );
}
