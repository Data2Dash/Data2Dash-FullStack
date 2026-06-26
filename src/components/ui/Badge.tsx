import React from 'react';
import { clsx } from 'clsx';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'success' | 'sage';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={clsx(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
        {
          'bg-stone-900 text-white dark:bg-zinc-100 dark:text-zinc-900': variant === 'default',
          'bg-stone-100 dark:bg-zinc-800 text-stone-600 dark:text-zinc-400 border border-stone-200 dark:border-zinc-700': variant === 'secondary',
          'text-stone-700 dark:text-zinc-300 border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900': variant === 'outline',
          'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/20': variant === 'success',
          'bg-sage-100 dark:bg-emerald-500/15 text-sage-700 dark:text-emerald-400 border border-sage-200 dark:border-emerald-500/20': variant === 'sage',
        },
        className
      )}
      {...props}
    />
  );
}
