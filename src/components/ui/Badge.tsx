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
          'bg-stone-900 text-white': variant === 'default',
          'bg-stone-100 text-stone-600 border border-stone-200': variant === 'secondary',
          'text-stone-700 border border-stone-200 bg-white': variant === 'outline',
          'bg-emerald-50 text-emerald-700 border border-emerald-100': variant === 'success',
          'bg-sage-100 text-sage-700 border border-sage-200': variant === 'sage',
        },
        className
      )}
      {...props}
    />
  );
}
