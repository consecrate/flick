// The top of a deck or folder page: emoji, editable title, counts, and the
// study mode buttons.

import { useState, type ReactNode } from 'react';
import { LockIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export function EmojiPicker({ value, choices, onPick }: { value: string; choices: string[]; onPick: (emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="grid size-[76px] shrink-0 -rotate-4 place-items-center rounded-lg border-2 border-brand-soft-strong bg-accent text-[42px] leading-none transition-transform duration-200 ease-bounce hover:scale-105 hover:rotate-4"
          aria-label="Change emoji"
        >
          {value}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-auto grid-cols-4 gap-1 bg-muted">
        {choices.map((e) => (
          <button
            key={e}
            className="size-9 rounded-md text-lg hover:bg-card"
            onClick={() => {
              onPick(e);
              setOpen(false);
            }}
          >
            {e}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** A page title you click to rename. */
export function EditableTitle({ value, onRename }: { value: string; onRename: (title: string) => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <Input
        className="h-auto px-2 py-0.5 font-display text-xl font-semibold"
        autoFocus
        defaultValue={value}
        onBlur={(e) => {
          setEditing(false);
          if (e.target.value.trim() && e.target.value !== value) onRename(e.target.value);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    );
  }
  return (
    <h1 onClick={() => setEditing(true)} title="Click to rename" className="cursor-text">
      {value}
    </h1>
  );
}

/** "12 cards · 3 due · …" with big numbers. */
export function StatLine({ items }: { items: { value: number | string; label: string; tone?: 'due' }[] }) {
  return (
    <div className="my-3 flex flex-wrap gap-6 text-sm text-muted-foreground">
      {items.map((it) => (
        <span key={it.label}>
          <b className={cn('mr-1 font-display text-lg font-bold text-foreground', it.tone === 'due' && 'text-brand-ink')}>{it.value}</b>
          {it.label}
        </span>
      ))}
    </div>
  );
}

export function ModeGrid({ children }: { children: ReactNode }) {
  return <div className="stagger grid grid-cols-5 gap-3 max-[860px]:grid-cols-2 max-[860px]:[&>:first-child]:col-span-2">{children}</div>;
}

export function ModeButton({
  icon,
  name,
  desc,
  primary,
  locked,
  disabled,
  onClick,
}: {
  icon: string;
  name: string;
  desc: ReactNode;
  primary?: boolean;
  /** Shows a lock before the description. */
  locked?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        'group flex flex-col items-center gap-0.5 rounded-lg border-2 border-border bg-card px-2 py-4 text-center text-foreground shadow-ledge transition-[transform,border-color,box-shadow] duration-150 ease-bounce hover:not-disabled:-translate-y-[3px] hover:not-disabled:border-primary active:not-disabled:translate-y-0.5 active:not-disabled:shadow-none disabled:cursor-not-allowed disabled:opacity-55',
        primary && 'border-primary bg-primary text-primary-foreground shadow-[0_3px_0_color-mix(in_srgb,var(--accent)_60%,var(--ink))]',
      )}
      disabled={disabled}
      onClick={onClick}
    >
      <span className="inline-block text-[34px] leading-tight group-hover:group-enabled:animate-wiggle">{icon}</span>
      <span className="font-display text-md font-semibold">{name}</span>
      <span className={cn('inline-flex items-center gap-1 text-xs', primary ? 'opacity-75' : 'text-muted-foreground')}>
        {locked && <LockIcon className="size-3" />}
        {desc}
      </span>
    </button>
  );
}
