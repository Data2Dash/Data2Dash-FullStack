import React from 'react';
import { clsx, type ClassValue } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 rounded-lg',
          {
            'bg-stone-900 text-white hover:bg-stone-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 shadow-sm active:scale-[0.98]': variant === 'primary',
            'bg-stone-100 dark:bg-zinc-800 text-stone-800 dark:text-zinc-200 hover:bg-stone-200 dark:hover:bg-zinc-700 border border-stone-200 dark:border-zinc-700': variant === 'secondary',
            'border border-stone-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:bg-stone-50 dark:hover:bg-zinc-800 text-stone-700 dark:text-zinc-300 hover:border-stone-300 dark:hover:border-zinc-600': variant === 'outline',
            'hover:bg-stone-100 dark:hover:bg-zinc-700 text-stone-600 dark:text-zinc-400 hover:text-stone-900 dark:hover:text-zinc-100': variant === 'ghost',
            'h-8 px-3 text-xs gap-1.5': size === 'sm',
            'h-10 px-4 py-2 text-sm gap-2': size === 'md',
            'h-12 px-6 text-base gap-2': size === 'lg',
          },
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';
