// Text clean-up before Markdown parsing; kept apart from the React component so tests can import it.

const CODE_SPLIT = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\n]*`)/;

/**
 * Prepare text for the Markdown parser, outside code only:
 * - \(…\) and \[…\] become $…$ and $$…$$;
 * - `<` is escaped, so `<div>` shows as typed instead of vanishing as HTML;
 * - a lone `$` that cannot start math (a price like "$5 or $10") is escaped,
 *   following Pandoc's rule: math opens with a non-space after `$` and closes
 *   with a non-space before a `$` that no digit follows.
 */
export function prepareMarkdown(text: string): string {
  return text
    .split(CODE_SPLIT)
    .map((part, i) => (i % 2 ? part : escapeText(part.replace(/\\\[([\s\S]+?)\\\]/g, (_, m) => `$$${m}$$`).replace(/\\\(([\s\S]+?)\\\)/g, (_, m) => `$${m}$`))))
    .join('');
}

function escapeText(s: string): string {
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      out += s.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (c !== '$') {
      out += c === '<' ? '&lt;' : c;
      i++;
      continue;
    }
    if (s[i + 1] === '$') {
      // Display math: copy through to the closing $$ when there is one.
      const end = s.indexOf('$$', i + 2);
      if (end > i + 2) {
        // remark-math renders $$…$$ as a display equation only when the
        // dollars sit on their own lines, so a whole-line $$…$$ gets them.
        const inner = s.slice(i + 2, end);
        const ownLine = (i === 0 || s[i - 1] === '\n') && (end + 2 === s.length || s[end + 2] === '\n');
        out += ownLine && !inner.includes('\n') ? `$$\n${inner.trim()}\n$$` : s.slice(i, end + 2);
        i = end + 2;
      } else {
        out += '\\$\\$';
        i += 2;
      }
      continue;
    }
    const close = findClosingDollar(s, i + 1);
    if (close > 0 && !/\s/.test(s[i + 1] ?? ' ')) {
      out += s.slice(i, close + 1);
      i = close + 1;
    } else {
      out += '\\$';
      i++;
    }
  }
  return out;
}

/** Index of the `$` that closes inline math opened just before `from`, or -1. */
function findClosingDollar(s: string, from: number): number {
  for (let j = from; j < s.length; j++) {
    if (s[j] === '\\') {
      j++;
      continue;
    }
    if (s[j] === '\n' && s[j + 1] === '\n') return -1; // math never spans paragraphs
    if (s[j] !== '$') continue;
    if (s[j + 1] === '$') return -1;
    const before = s[j - 1];
    if (j === from || /\s/.test(before) || /\d/.test(s[j + 1] ?? '')) return -1;
    return j;
  }
  return -1;
}
