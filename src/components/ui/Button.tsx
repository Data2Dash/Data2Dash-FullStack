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
            'bg-stone-900 text-white hover:bg-stone-700 shadow-sm active:scale-[0.98]': variant === 'primary',
            'bg-stone-100 text-stone-800 hover:bg-stone-200 border border-stone-200': variant === 'secondary',
            'border border-stone-200 bg-white hover:bg-stone-50 text-stone-700 hover:border-stone-300': variant === 'outline',
            'hover:bg-stone-100 text-stone-600 hover:text-stone-900': variant === 'ghost',
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
