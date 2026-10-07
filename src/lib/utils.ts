import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge the theme's extra sizes and shadows so `text-md` isn't
// mistaken for a color and dropped when a component merges classes.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['md'],
      shadow: ['ledge', 'ledge-lg', 'overlay'],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
