import { describe, expect, it } from 'vitest';
import { prepareMarkdown } from '../src/lib/markdown.ts';

describe('prepareMarkdown', () => {
  it('keeps inline and display math', () => {
    expect(prepareMarkdown('Solve $x^2 = 4$ now')).toBe('Solve $x^2 = 4$ now');
    expect(prepareMarkdown('Evaluate $$\\int_0^1 x\\,dx$$ now')).toBe('Evaluate $$\\int_0^1 x\\,dx$$ now');
  });

  it('puts a whole-line $$…$$ on its own lines so it renders as a display equation', () => {
    expect(prepareMarkdown('Rule:\n\n$$x^2$$\n\nDone')).toBe('Rule:\n\n$$\nx^2\n$$\n\nDone');
  });

  it('turns \\( \\) and \\[ \\] into dollar math', () => {
    expect(prepareMarkdown('so \\(a+b\\) and \\[c\\]')).toBe('so $a+b$ and $$c$$');
  });

  it('escapes dollars that are prices', () => {
    expect(prepareMarkdown('It costs $5 or $10.')).toBe('It costs \\$5 or \\$10.');
    expect(prepareMarkdown('Pay $5, then solve $x$')).toBe('Pay \\$5, then solve $x$');
  });

  it('escapes < outside math so HTML-like text shows as typed', () => {
    expect(prepareMarkdown('Use <div> here, and $a<b$')).toBe('Use &lt;div> here, and $a<b$');
  });

  it('leaves code untouched', () => {
    expect(prepareMarkdown('Run `echo $HOME <x>`')).toBe('Run `echo $HOME <x>`');
    expect(prepareMarkdown('```sh\necho $PATH\n```')).toBe('```sh\necho $PATH\n```');
  });

  it('keeps escaped dollars as they are', () => {
    expect(prepareMarkdown('a \\$5 fee')).toBe('a \\$5 fee');
  });
});
