// Markdown with math for everything a learner reads: card fronts and backs,
// options, hints, explanations, Claude's feedback and answers. GitHub-style
// Markdown, single newlines kept as line breaks, fenced code highlighted by
// CodeBlock, and LaTeX math rendered by KaTeX between $…$ (inline) or $$…$$
// (display). Claude often writes \(…\) and \[…\] instead, so those work too.

import 'katex/dist/katex.min.css';
import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { normalizeLang } from '../../shared/mcq.ts';
import { prepareMarkdown } from '@/lib/markdown';
import { cn } from '@/lib/utils';
import { CodeBlock } from './Code.tsx';

const remarkPlugins = [remarkGfm, remarkMath, remarkBreaks];
const rehypePlugins: NonNullable<Parameters<typeof ReactMarkdown>[0]['rehypePlugins']> = [[rehypeKatex, { throwOnError: false, strict: 'ignore' }]];

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
}

const textOf = (n: HastNode): string => n.value ?? (n.children ?? []).map(textOf).join('');

const blockComponents: Components = {
  pre({ node }) {
    const code = (node as HastNode | undefined)?.children?.find((c) => c.tagName === 'code');
    if (!code) return null;
    const classes = Array.isArray(code.properties?.className) ? (code.properties.className as string[]) : [];
    const lang = classes.find((c) => c.startsWith('language-'))?.slice('language-'.length);
    return <CodeBlock code={textOf(code).replace(/\n$/, '')} lang={normalizeLang(lang)} compact />;
  },
  a({ node: _node, ...props }) {
    return <a {...props} target="_blank" rel="noreferrer" />;
  },
};

// Inline text (an option, an answer) keeps its paragraphs on one line.
const inlineComponents: Components = {
  ...blockComponents,
  p({ children }) {
    return <span>{children}</span>;
  },
};

/** Text with nothing Markdown or math could change renders as is, without a parse. */
const PLAIN = /^[^*_`$\\[\]<>#|~&!\n]*$/;
const LIST_START = /^\s*([-+]|\d+[.)])\s/;

function MarkdownImpl({ text, inline = false, className }: { text: string; inline?: boolean; className?: string }) {
  const Tag = inline ? 'span' : 'div';
  if (PLAIN.test(text) && !LIST_START.test(text)) {
    return <Tag className={cn('md', inline && 'md-inline', className)}>{inline ? text : <p>{text}</p>}</Tag>;
  }
  return (
    <Tag className={cn('md', inline && 'md-inline', className)}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={inline ? inlineComponents : blockComponents}>
        {prepareMarkdown(text)}
      </ReactMarkdown>
    </Tag>
  );
}

/** Markdown and math. `inline` keeps it to one run of text, for options and answers. */
export const Markdown = memo(MarkdownImpl);
