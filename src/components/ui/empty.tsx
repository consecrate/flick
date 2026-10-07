import * as React from 'react';

import { cn } from '@/lib/utils';

function Empty({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="empty"
      className={cn('flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-input bg-card px-6 py-8 text-center text-balance', className)}
      {...props}
    />
  );
}

function EmptyHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="empty-header" className={cn('flex max-w-[44ch] flex-col items-center gap-2', className)} {...props} />;
}

function EmptyMedia({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="empty-media" className={cn('mb-1 text-[40px] leading-none', className)} {...props} />;
}

function EmptyTitle({ className, ...props }: React.ComponentProps<'h3'>) {
  return <h3 data-slot="empty-title" className={cn('font-display text-lg font-semibold', className)} {...props} />;
}

function EmptyDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p data-slot="empty-description" className={cn('text-muted-foreground', className)} {...props} />;
}

function EmptyContent({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="empty-content" className={cn('mt-2 flex flex-wrap items-center justify-center gap-2', className)} {...props} />;
}

export { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle };
