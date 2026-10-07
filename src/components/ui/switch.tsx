import * as React from 'react';
import { Switch as SwitchPrimitive } from 'radix-ui';

import { cn } from '@/lib/utils';

function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'peer inline-flex h-[26px] w-11 shrink-0 items-center rounded-full bg-track shadow-[inset_0_0_0_2px_var(--border-strong)] transition-[background-color,box-shadow] duration-200 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=checked]:shadow-[inset_0_0_0_2px_var(--accent)]',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="pointer-events-none block size-5 translate-x-[3px] rounded-full bg-white shadow-[0_2px_0_rgb(0_0_0/0.15)] transition-transform duration-300 ease-bounce data-[state=checked]:translate-x-[21px]"
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
