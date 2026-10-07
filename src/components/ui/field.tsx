import * as React from 'react';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** A form row: label, control, and an optional description under it. */
function Field({ className, orientation = 'vertical', ...props }: React.ComponentProps<'div'> & { orientation?: 'vertical' | 'horizontal' }) {
  return (
    <div
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn('flex gap-1.5', orientation === 'vertical' ? 'flex-col' : 'items-center gap-3', className)}
      {...props}
    />
  );
}

function FieldGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="field-group" className={cn('flex flex-col gap-4', className)} {...props} />;
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return <Label data-slot="field-label" className={className} {...props} />;
}

function FieldDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p data-slot="field-description" className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

function FieldError({ className, ...props }: React.ComponentProps<'p'>) {
  return <p role="alert" data-slot="field-error" className={cn('text-sm text-destructive', className)} {...props} />;
}

export { Field, FieldDescription, FieldError, FieldGroup, FieldLabel };
