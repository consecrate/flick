import * as React from 'react';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';

function Breadcrumb(props: React.ComponentProps<'nav'>) {
  return <nav aria-label="breadcrumb" data-slot="breadcrumb" {...props} />;
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<'ol'>) {
  return <ol data-slot="breadcrumb-list" className={cn('flex min-w-0 flex-wrap items-center gap-0.5 text-sm', className)} {...props} />;
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<'li'>) {
  return <li data-slot="breadcrumb-item" className={cn('inline-flex items-center gap-0.5', className)} {...props} />;
}

const crumb = 'inline-flex items-center gap-1 rounded-full border-2 border-transparent px-2 py-1 font-semibold transition-colors';

function BreadcrumbLink({ asChild, className, ...props }: React.ComponentProps<'a'> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'a';
  return <Comp data-slot="breadcrumb-link" className={cn(crumb, 'text-muted-foreground no-underline hover:bg-muted hover:text-foreground', className)} {...props} />;
}

function BreadcrumbPage({ className, ...props }: React.ComponentProps<'span'>) {
  return <span data-slot="breadcrumb-page" role="link" aria-disabled="true" aria-current="page" className={cn(crumb, 'text-foreground', className)} {...props} />;
}

function BreadcrumbSeparator({ children, className, ...props }: React.ComponentProps<'li'>) {
  return (
    <li data-slot="breadcrumb-separator" role="presentation" aria-hidden="true" className={cn('text-faint', className)} {...props}>
      {children ?? '/'}
    </li>
  );
}

export { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator };
