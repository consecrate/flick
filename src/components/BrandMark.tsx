import { ZapIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Flick's bolt logo, tilted on an accent tile. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn('grid size-[34px] -rotate-6 place-items-center rounded-[11px] bg-primary text-[#ffd23f] shadow-[0_3px_0_color-mix(in_srgb,var(--accent)_60%,var(--ink))]', className)}>
      <ZapIcon className="size-5" fill="currentColor" strokeWidth={1.75} />
    </span>
  );
}
