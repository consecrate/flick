import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { normalizeLang } from '../../shared/mcq.ts';

type Hljs = typeof import('highlight.js').default;

// highlight.js is loaded on first use so decks without code never pay for it.
let loading: Promise<Hljs> | null = null;
function loadHljs(): Promise<Hljs> {
  loading ??= (async () => {
    const hljs = (await import('highlight.js/lib/common')).default;
    const extra = await Promise.all([
      import('highlight.js/lib/languages/verilog'),
      import('highlight.js/lib/languages/vhdl'),
      import('highlight.js/lib/languages/haskell'),
      import('highlight.js/lib/languages/scala'),
      import('highlight.js/lib/languages/x86asm'),
      import('highlight.js/lib/languages/julia'),
      import('highlight.js/lib/languages/dart'),
      import('highlight.js/lib/languages/elixir'),
      import('highlight.js/lib/languages/ocaml'),
      import('highlight.js/lib/languages/matlab'),
    ]);
    const names = ['verilog', 'vhdl', 'haskell', 'scala', 'x86asm', 'julia', 'dart', 'elixir', 'ocaml', 'matlab'];
    extra.forEach((m, i) => {
      if (!hljs.getLanguage(names[i])) hljs.registerLanguage(names[i], m.default);
    });
    return hljs;
  })();
  return loading;
}

/** Display names for the language label above a code block. */
const LANG_LABEL: Record<string, string> = {
  cpp: 'C++',
  c: 'C',
  csharp: 'C#',
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  python: 'Python',
  java: 'Java',
  rust: 'Rust',
  go: 'Go',
  sql: 'SQL',
  bash: 'Shell',
  kotlin: 'Kotlin',
  swift: 'Swift',
  ruby: 'Ruby',
  php: 'PHP',
  verilog: 'Verilog',
  vhdl: 'VHDL',
  haskell: 'Haskell',
  scala: 'Scala',
  x86asm: 'Assembly',
  plaintext: 'Text',
};

export function CodeBlock({ code, lang, compact }: { code: string; lang?: string; compact?: boolean }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setHtml(null);
    if (!lang || lang === 'plaintext') return;
    loadHljs()
      .then((hljs) => {
        if (live && hljs.getLanguage(lang)) setHtml(hljs.highlight(code, { language: lang, ignoreIllegals: true }).value);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [code, lang]);

  return (
    <div className={`code-block ${compact ? 'compact' : ''}`}>
      {lang && <div className="code-lang">{LANG_LABEL[lang] ?? lang}</div>}
      <pre>
        {/* highlight.js escapes the source, so its output is safe to insert. */}
        {html !== null ? <code className="hljs" dangerouslySetInnerHTML={{ __html: html }} /> : <code>{code}</code>}
      </pre>
    </div>
  );
}

/** `code` and **bold** inside one line of text. */
export function Inline({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  const re = /`([^`\n]+)`|\*\*([^*\n]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(m[1] !== undefined ? <code key={m.index} className="inline-code">{m[1]}</code> : <b key={m.index}>{m[2]}</b>);
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/**
 * Small Markdown subset used in questions, options and explanations: fenced
 * code blocks (highlighted), inline code and bold. Line breaks are kept.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const blocks: ({ kind: 'text'; text: string } | { kind: 'code'; lang?: string; code: string })[] = [];
  const lines = text.split('\n');
  let buf: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^\s*(`{3,}|~{3,})\s*([\w+#.-]*)\s*$/);
    if (!open) {
      buf.push(lines[i]);
      continue;
    }
    const close = lines.findIndex((l, j) => j > i && l.trim().startsWith(open[1]) && l.trim().replace(/[`~]/g, '') === '');
    if (close < 0) {
      buf.push(lines[i]);
      continue;
    }
    if (buf.join('').trim()) blocks.push({ kind: 'text', text: buf.join('\n').trim() });
    buf = [];
    blocks.push({ kind: 'code', lang: normalizeLang(open[2]), code: lines.slice(i + 1, close).join('\n') });
    i = close;
  }
  if (buf.join('').trim()) blocks.push({ kind: 'text', text: buf.join('\n').trim() });

  return (
    <div className={`rich ${className ?? ''}`}>
      {blocks.map((b, i) =>
        b.kind === 'code' ? (
          <CodeBlock key={i} code={b.code} lang={b.lang} compact />
        ) : (
          <p key={i}>
            {b.text.split('\n').map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                <Inline text={l} />
              </Fragment>
            ))}
          </p>
        ),
      )}
    </div>
  );
}
