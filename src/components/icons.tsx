// Small stroke icons for interface controls. Content (deck emoji, avatars,
// trophies, shop items) stays emoji; chrome uses these so it reads as one set.

const PATHS = {
  flame: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z',
  coin: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M12 8v8 M9.5 10h3.75a1.25 1.25 0 0 1 0 2.5h-2.5a1.25 1.25 0 0 0 0 2.5H14.5',
  hint: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.5 10.9c.6.45 1 1.1 1 1.85V16h5v-.25c0-.75.4-1.4 1-1.85A6 6 0 0 0 12 3z',
  freeze: 'M12 2v20 M3.3 7l17.4 10 M20.7 7 3.3 17 M9 4l3 2 3-2 M9 20l3-2 3 2',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7l1-8z',
  heart: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7z',
  x: 'M18 6 6 18 M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  plus: 'M12 5v14 M5 12h14',
  play: 'M7 4.5v15l12-7.5z',
  lock: 'M6 11h12v10H6z M8 11V7a4 4 0 0 1 8 0v4',
  chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  star: 'M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z',
  more: 'M5 12h.01 M12 12h.01 M19 12h.01',
  trash: 'M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3',
  back: 'M19 12H5 M12 19l-7-7 7-7',
  gift: 'M3 8h18v4H3z M12 8v13 M19 12v9H5v-9 M12 8S10.5 3 8 3a2.5 2.5 0 0 0 0 5 M12 8s1.5-5 4-5a2.5 2.5 0 0 1 0 5',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16, filled = false, className = '' }: { name: IconName; size?: number; filled?: boolean; className?: string }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={size <= 16 ? 2 : 1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
