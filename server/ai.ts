// Prompts and schemas for every AI feature.

import type { ModelChoice } from '../shared/types.ts';
import { EXPLANATION_GUIDE, FLASHCARD_GUIDE, MATH_GUIDE, WRITING_GUIDE, normalizeLang } from '../shared/mcq.ts';
import { callClaude } from './claude.ts';

/** Plain-English rules for every explanation Claude writes for a student. */
const PLAIN_ENGLISH = `Write explanations for a smart student who is new to the subject: plain English, short sentences, active voice, literal words. Define a technical term the first time you use it. No filler ("basically", "it is important to note"), no decorative metaphors.`;

const CARD_WRITER = `You are Flick's card author. You turn study material into a set of spaced-repetition cards that a student will review for years. Each card is either a short-answer flashcard or an exam-style multiple-choice question; you pick the better type for each idea.

${WRITING_GUIDE}

${PLAIN_ENGLISH}

Field rules for every card:
- "type": "flashcard" or "mcq".
- "title": for a multiple-choice question, 2 to 6 words naming what it is about. For a flashcard, an empty string.
- "question": the question text, with every assumption the answer depends on. Do not put code here.
- "code": a code snippet when the card is about code, otherwise an empty string. "language": its language in lowercase (java, cpp, python, rust, sql, ...), otherwise an empty string.
- "answer": the correct answer. For a flashcard, the short answer. For a multiple-choice question, the correct option.
- "distractors": for a flashcard, exactly 3 wrong answers. For a multiple-choice question, the wrong options (2 to 7), each the answer one named misconception produces.
- "hint": for a multiple-choice question, one sentence that points at the mechanism. For a flashcard, an empty string.
- "explanation": as described above. Use Markdown: \`backticks\` for code, $LaTeX$ for math, a "- " line per wrong option.
- No duplicates and no trivia about the document itself (page numbers, slide authors).
- Write in the same language as the source material.`;

/** Writes multiple-choice options for existing cards (used after a plain list import). */
const DISTRACTOR_WRITER = `You are Flick's card author.

${FLASHCARD_GUIDE}

${EXPLANATION_GUIDE}

${MATH_GUIDE}`;

export interface GeneratedCard {
  front: string;
  back: string;
  distractors: string[];
  explanation: string;
  mcq?: boolean;
  title?: string;
  code?: string;
  codeLang?: string;
  hint?: string;
}

interface GeneratedItem {
  type: 'flashcard' | 'mcq';
  title: string;
  question: string;
  code: string;
  language: string;
  answer: string;
  distractors: string[];
  hint: string;
  explanation: string;
}

export interface GenerationResult {
  deckTitle: string;
  emoji: string;
  description: string;
  materialTitle: string;
  cards: GeneratedCard[];
}

const itemSchema = {
  type: 'object',
  properties: {
    type: { type: 'string', enum: ['flashcard', 'mcq'] },
    title: { type: 'string' },
    question: { type: 'string' },
    code: { type: 'string' },
    language: { type: 'string' },
    answer: { type: 'string' },
    distractors: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 7 },
    hint: { type: 'string' },
    explanation: { type: 'string' },
  },
  required: ['type', 'title', 'question', 'code', 'language', 'answer', 'distractors', 'hint', 'explanation'],
  additionalProperties: false,
};

const generationSchema = {
  type: 'object',
  properties: {
    deckTitle: { type: 'string', description: 'Short deck title (max 6 words)' },
    emoji: { type: 'string', description: 'One emoji that represents the subject' },
    description: { type: 'string', description: 'One-sentence deck description' },
    materialTitle: { type: 'string', description: 'Short title for this source material' },
    cards: { type: 'array', items: itemSchema },
  },
  required: ['deckTitle', 'emoji', 'description', 'materialTitle', 'cards'],
  additionalProperties: false,
};

export interface GenerateInput {
  text?: string;
  topic?: string;
  url?: string;
  files?: { path: string; name: string }[];
  focus?: string;
  level?: string;
  existingFronts: string[];
  model: ModelChoice;
  thinking?: boolean;
}

/** Turn one item from Claude's structured output into card fields. */
export function itemToCard(q: GeneratedItem): GeneratedCard {
  const mcq = q.type === 'mcq';
  const code = q.code?.trim() ? q.code : '';
  return {
    front: q.question,
    back: q.answer,
    distractors: mcq ? q.distractors : q.distractors.slice(0, 3),
    explanation: q.explanation,
    mcq,
    title: mcq ? q.title : undefined,
    code: code || undefined,
    codeLang: code ? normalizeLang(q.language) : undefined,
    hint: mcq ? q.hint : undefined,
  };
}

export async function generateCards(input: GenerateInput) {
  const parts: string[] = [];
  const tools: string[] = [];
  const addDirs = new Set<string>();

  if (input.files?.length) {
    tools.push('Read');
    parts.push(
      'Source material is in these files. Read every one of them in full with the Read tool before writing cards:\n' +
        input.files.map((f) => `- ${f.path}  (uploaded as "${f.name}")`).join('\n'),
    );
    for (const f of input.files) addDirs.add(f.path.replace(/[/\\][^/\\]+$/, ''));
  }
  if (input.url) {
    tools.push('WebFetch');
    parts.push(`Source material is the web page at ${input.url}. Fetch it with WebFetch and use its main content.`);
  }
  if (input.text) {
    parts.push(`Source material:\n<material>\n${input.text}\n</material>`);
  }
  if (input.topic) {
    parts.push(
      `There is no source document. Write cards about this topic from your own knowledge, covering the fundamentals a student should know first:\n<topic>${input.topic}</topic>`,
    );
  }
  parts.push('Write as many cards as it takes to cover every idea worth remembering, mixing flashcards and multiple-choice questions as the guide describes.');
  if (input.focus) parts.push(`Focus on: ${input.focus}`);
  if (input.level) parts.push(`Target level: ${input.level}`);
  if (input.existingFronts.length) {
    parts.push(
      'The deck already has these questions. Do not repeat them; cover what they miss:\n' +
        input.existingFronts.slice(0, 200).map((f) => `- ${f}`).join('\n'),
    );
  }
  parts.push('Respond only with the structured output.');

  const res = await callClaude<Omit<GenerationResult, 'cards'> & { cards: GeneratedItem[] }>({
    prompt: parts.join('\n\n'),
    system: CARD_WRITER,
    model: input.model,
    schema: generationSchema,
    tools,
    addDirs: [...addDirs],
    // Full coverage of a long chapter can mean 60+ cards, which takes a while to write.
    timeoutMs: 600_000,
    thinking: input.thinking,
  });
  const cards = (res.data.cards ?? []).map(itemToCard);
  return { ...res.data, cards: cards.filter((c) => c.front?.trim() && c.back?.trim()), costUsd: res.costUsd };
}

export async function gradeAnswer(opts: {
  question: string;
  expected: string;
  given: string;
  model: ModelChoice;
}) {
  const res = await callClaude<{ correct: boolean; feedback: string }>({
    system:
      'You grade flashcard answers fairly. Accept answers that show the student knows the fact: synonyms, paraphrases, minor misspellings, different word order, or extra correct detail. Reject answers that are wrong, too vague to show knowledge, or that miss the key part of the expected answer. Feedback: one short, friendly sentence addressed to the student, in Markdown. Write any math in LaTeX between dollar signs ($x^2$), code in `backticks`, and a literal dollar sign as \\$.',
    prompt: `Question: ${opts.question}\nExpected answer: ${opts.expected}\nStudent answer: ${opts.given}`,
    model: opts.model,
    schema: {
      type: 'object',
      properties: { correct: { type: 'boolean' }, feedback: { type: 'string' } },
      required: ['correct', 'feedback'],
      additionalProperties: false,
    },
    timeoutMs: 90_000,
  });
  return res.data;
}

export async function explainCard(opts: {
  front: string;
  back: string;
  title?: string;
  code?: string;
  codeLang?: string;
  distractors?: string[];
  explanation?: string;
  question?: string;
  deckTitle: string;
  model: ModelChoice;
}) {
  const ask = opts.question?.trim()
    ? `The student asks: ${opts.question}`
    : 'Explain this so it sticks. Start with the answer in one or two plain sentences. Then explain the idea behind it from the ground up, defining any term the student may not know before you use it. End with one concrete example or a short walk-through (for code, trace what happens line by line).';
  const card = [
    `Deck: ${opts.deckTitle}`,
    opts.title && `Question title: ${opts.title}`,
    `Question: ${opts.front}`,
    opts.code && `Code:\n\`\`\`${opts.codeLang ?? ''}\n${opts.code}\n\`\`\``,
    `Correct answer: ${opts.back}`,
    opts.distractors?.length && `Wrong options shown: ${opts.distractors.join(' | ')}`,
    opts.explanation && `Card note: ${opts.explanation}`,
  ].filter(Boolean);
  const res = await callClaude<string>({
    system: `You are a friendly tutor inside a flashcard app. Assume the student is intelligent but new to the subject. ${PLAIN_ENGLISH} Use the same word for the same thing throughout. Answer in at most 180 words of Markdown: short paragraphs, bullets only for real lists, \`backticks\` for code. Write math in LaTeX: $x^2$ inline, $$...$$ on its own line for a display equation, and a literal dollar sign as \\$. No preamble and no closing summary.`,
    prompt: `${card.join('\n')}\n\n${ask}`,
    model: opts.model,
    timeoutMs: 120_000,
  });
  return res.text;
}

export async function makeDistractors(opts: {
  cards: { id: string; front: string; back: string }[];
  model: ModelChoice;
}) {
  const res = await callClaude<{ items: { id: string; distractors: string[]; explanation: string }[] }>({
    system: DISTRACTOR_WRITER,
    prompt:
      'For each flashcard below write 3 distractors and a 1-2 sentence explanation. Each distractor is the answer a student with one specific, common misunderstanding would give, with the same type, length and style as the correct answer. Keep each id exactly.\n\n' +
      JSON.stringify(opts.cards),
    model: opts.model,
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              distractors: { type: 'array', items: { type: 'string' } },
              explanation: { type: 'string' },
            },
            required: ['id', 'distractors', 'explanation'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
    timeoutMs: 240_000,
  });
  return res.data.items ?? [];
}

/**
 * Parse pasted term/definition lists (Quizlet export, Anki txt export, CSV,
 * "term - definition", "term: definition") without calling Claude.
 */
export function parsePairs(text: string): { front: string; back: string }[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const seps = ['\t', ' :: ', ' - ', ' – ', ' — ', ';', ': ', ','];
  let best: { sep: string; hits: number } = { sep: '', hits: 0 };
  for (const sep of seps) {
    const hits = lines.filter((l) => l.includes(sep)).length;
    if (hits > best.hits) best = { sep, hits };
  }
  if (!best.sep || best.hits < Math.max(1, lines.length * 0.6)) return [];
  const out: { front: string; back: string }[] = [];
  for (const l of lines) {
    const i = l.indexOf(best.sep);
    if (i <= 0) continue;
    const front = unquote(l.slice(0, i));
    const back = unquote(l.slice(i + best.sep.length));
    if (front && back) out.push({ front, back });
  }
  return out;
}

function unquote(s: string) {
  return s.trim().replace(/^"(.*)"$/, '$1').replace(/<[^>]+>/g, '').trim();
}
