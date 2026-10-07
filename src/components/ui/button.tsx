import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';

// Raised buttons sit on a 2px ledge and press down into it.
const pressable = 'hover:not-disabled:-translate-y-px active:not-disabled:translate-y-0.5 active:not-disabled:shadow-none';

const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full border-2 font-display font-semibold no-underline select-none outline-none transition-[transform,box-shadow,background-color,border-color,color] duration-150 ease-bounce focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: cn(
          'border-ink bg-ink text-surface shadow-[0_3px_0_color-mix(in_srgb,var(--ink)_55%,var(--accent))] hover:not-disabled:bg-[color-mix(in_srgb,var(--ink)_88%,var(--accent))]',
          pressable,
        ),
        brand: cn('border-primary bg-primary text-primary-foreground shadow-[0_3px_0_color-mix(in_srgb,var(--accent)_60%,var(--ink))]', pressable),
        outline: cn('border-border bg-card text-foreground shadow-ledge hover:not-disabled:border-input', pressable),
        ghost: 'border-border bg-transparent text-foreground hover:not-disabled:bg-muted',
        plain: 'border-transparent bg-transparent text-muted-foreground hover:not-disabled:bg-muted hover:not-disabled:text-foreground',
        success: cn('border-success bg-success text-white shadow-[0_3px_0_color-mix(in_srgb,var(--good)_65%,black)]', pressable),
        warning: cn('border-warning bg-warning text-[#3a2600] shadow-[0_3px_0_color-mix(in_srgb,var(--warn)_60%,black)]', pressable),
        destructive: cn('border-destructive bg-destructive text-white shadow-[0_3px_0_color-mix(in_srgb,var(--bad)_65%,black)]', pressable),
        link: 'h-auto! border-0 bg-transparent p-0! font-sans text-brand-ink hover:underline',
      },
      size: {
        default: 'h-10 px-6 text-base',
        sm: 'h-8 px-4 text-sm',
        lg: 'h-13 px-8 text-md',
        icon: 'size-9 p-0',
        'icon-sm': 'size-8 p-0',
      },
    },
    defaultVariants: { variant: 'outline', size: 'default' },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { Button, buttonVariants };
