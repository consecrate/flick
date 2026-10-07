import { useEffect, useState } from 'react';

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
