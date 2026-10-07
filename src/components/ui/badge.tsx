import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-3 font-display text-xs font-semibold whitespace-nowrap [&>svg]:size-3 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-muted text-muted-foreground',
        brand: 'bg-accent text-accent-foreground',
        warning: 'bg-warning-soft text-warning-ink',
        success: 'bg-success-soft text-success-ink',
        destructive: 'bg-destructive-soft text-destructive',
        outline: 'border-2 border-border text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

function Badge({ className, variant, asChild = false, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';
  return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
