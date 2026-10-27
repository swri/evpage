'use client';

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[color,background-color,border-color,box-shadow,opacity,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 disabled:pointer-events-none disabled:opacity-50 cursor-pointer select-none active:scale-[0.97] aria-busy:cursor-progress',
  {
    variants: {
      variant: {
        default:
          'bg-neutral-900 text-white shadow-xs hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200',
        destructive:
          'bg-red-600 text-white shadow-xs hover:bg-red-700 dark:bg-red-900 dark:text-red-100 dark:hover:bg-red-800',
        outline:
          'border border-neutral-300 bg-white text-neutral-800 shadow-2xs hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200 dark:hover:bg-neutral-800',
        secondary:
          'bg-neutral-100 text-neutral-900 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700',
        ghost:
          'hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-50',
        link: 'text-neutral-900 underline-offset-4 hover:underline dark:text-neutral-100',
        success: 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-800'
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-lg px-6 text-base',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

/**
 * Shows a spinner while `isLoading` is set, or while the Promise returned by
 * `onClick` is pending (`onClick={() => handleSave()}` needs no extra state).
 * A busy button keeps its size and ignores further clicks.
 */
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, isLoading, children, disabled, onClick, ...props }, ref) => {
    const [pending, setPending] = React.useState(false);
    const busy = !!isLoading || pending;

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      // Also cancels implicit form submission (Enter in a field) while busy
      if (busy) {
        e.preventDefault();
        return;
      }
      const result: unknown = onClick?.(e);
      if (result instanceof Promise) {
        setPending(true);
        result.finally(() => setPending(false));
      }
    };

    return (
      <button
        className={cn(buttonVariants({ variant, size, className }), busy && 'relative')}
        ref={ref}
        disabled={disabled}
        aria-busy={busy || undefined}
        aria-disabled={busy || undefined}
        onClick={handleClick}
        {...props}
      >
        {busy ? (
          <>
            <span className="btn-busy-label inline-flex items-center justify-center gap-[inherit]">{children}</span>
            <span className="btn-busy-spinner absolute inset-0 flex items-center justify-center">
              <Loader2 className={cn('animate-spin', size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
            </span>
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants };
