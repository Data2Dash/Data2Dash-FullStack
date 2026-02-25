import React from 'react';
import { clsx } from 'clsx';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={clsx(
          'flex h-10 w-full rounded-xl border border-stone-200 bg-white px-4 py-2 text-sm text-stone-900',
          'placeholder:text-stone-400',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:ring-offset-0 focus-visible:border-stone-400',
          'disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200',
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';
