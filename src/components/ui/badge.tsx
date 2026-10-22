import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none select-none',
  {
    variants: {
      variant: {
        default:
          'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900',
        secondary:
          'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200',
        outline:
          'border border-neutral-300 text-neutral-700 dark:border-neutral-700 dark:text-neutral-300',
        success:
          'bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
        warning:
          'bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
        destructive:
          'bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800',
        info:
          'bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
