import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const alertVariants = cva('relative flex w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-md border-2 px-4 py-3 font-medium', {
  variants: {
    variant: {
      default: 'border-border bg-card',
      brand: 'border-dashed border-brand-soft-strong bg-accent',
      warning: 'border-[color-mix(in_srgb,var(--warn)_40%,var(--surface))] bg-warning-soft text-warning-ink',
      success: 'border-[color-mix(in_srgb,var(--good)_35%,var(--surface))] bg-success-soft text-success-ink',
      destructive: 'border-[color-mix(in_srgb,var(--bad)_35%,var(--surface))] bg-destructive-soft text-destructive',
    },
  },
  defaultVariants: { variant: 'default' },
});

function Alert({ className, variant, ...props }: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-title" className={cn('font-display font-semibold', className)} {...props} />;
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="alert-description" className={cn('flex-1', className)} {...props} />;
}

export { Alert, AlertDescription, AlertTitle };
