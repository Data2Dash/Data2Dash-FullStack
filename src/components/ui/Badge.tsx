import React from 'react';
import { clsx } from 'clsx';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'success';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={clsx(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        {
          'border-transparent bg-indigo-600 text-white hover:bg-indigo-700': variant === 'default',
          'border-transparent bg-slate-100 text-slate-900 hover:bg-slate-200': variant === 'secondary',
          'text-slate-950 border-slate-200': variant === 'outline',
          'border-transparent bg-emerald-100 text-emerald-700': variant === 'success',
        },
        className
      )}
      {...props}
    />
  );
}
