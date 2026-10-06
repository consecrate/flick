// Prompts and schemas for every AI feature.

import type { ModelChoice } from '../shared/types.ts';
import { callClaude } from './claude.ts';

const CARD_WRITER = `You are Flick's flashcard author: an expert at writing spaced-repetition flashcards that are easy to quiz.

Rules for every card:
- One idea per card. The front asks a single, specific, unambiguous question; never "Describe X" or "What do you know about X".
- The back is the short correct answer: ideally 1-8 words, never more than one sentence. Students may have to type it, so avoid long lists.
- Include enough context in the question that there is only one defensible answer.
- "distractors": exactly 3 wrong answers for a multiple-choice version. They must be plausible, the same type, length and style as the correct answer, clearly wrong to someone who knows the material, and never "All/None of the above".
- "explanation": 1-2 sentences that explain why the answer is right or give a memorable hook. Do not just restate the answer.
- Cover the most important, testable ideas first. No duplicates and no trivia about the document itself (page numbers, author of the slides, etc.).
- Write in the same language as the source material.`;

export interface GeneratedCard {
  front: string;
  back: string;
  distractors: string[];
  explanation: string;
}

export interface GenerationResult {
  deckTitle: string;
  emoji: string;
  description: string;
  materialTitle: string;
  cards: GeneratedCard[];
}

const cardSchema = {
  type: 'object',
  properties: {
    front: { type: 'string' },
    back: { type: 'string' },
    distractors: { type: 'array', items: { type: 'string' }, minItems: 3, maxItems: 3 },
    explanation: { type: 'string' },
  },
  required: ['front', 'back', 'distractors', 'explanation'],
  additionalProperties: false,
};

const generationSchema = {
  type: 'object',
  properties: {
    deckTitle: { type: 'string', description: 'Short deck title (max 6 words)' },
    emoji: { type: 'string', description: 'One emoji that represents the subject' },
    description: { type: 'string', description: 'One-sentence deck description' },
    materialTitle: { type: 'string', description: 'Short title for this source material' },
    cards: { type: 'array', items: cardSchema },
  },
  required: ['deckTitle', 'emoji', 'description', 'materialTitle', 'cards'],
  additionalProperties: false,
};

export interface GenerateInput {
  text?: string;
  topic?: string;
  url?: string;
  files?: { path: string; name: string }[];
  count: number;
  focus?: string;
  level?: string;
  existingFronts: string[];
  model: ModelChoice;
  thinking?: boolean;
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
  parts.push(`Write ${input.count} flashcards.`);
  if (input.focus) parts.push(`Focus on: ${input.focus}`);
  if (input.level) parts.push(`Target level: ${input.level}`);
  if (input.existingFronts.length) {
    parts.push(
      'The deck already has these questions. Do not repeat them; cover new ground:\n' +
        input.existingFronts.slice(0, 200).map((f) => `- ${f}`).join('\n'),
    );
  }
  parts.push('Respond only with the structured output.');

  const res = await callClaude<GenerationResult>({
    prompt: parts.join('\n\n'),
    system: CARD_WRITER,
    model: input.model,
    schema: generationSchema,
    tools,
    addDirs: [...addDirs],
    timeoutMs: 360_000,
    thinking: input.thinking,
  });
  const cards = (res.data.cards ?? []).filter((c) => c.front?.trim() && c.back?.trim());
  return { ...res.data, cards, costUsd: res.costUsd };
}

export async function gradeAnswer(opts: {
  question: string;
  expected: string;
  given: string;
  model: ModelChoice;
}) {
  const res = await callClaude<{ correct: boolean; feedback: string }>({
    system:
      'You grade flashcard answers fairly. Accept answers that show the student knows the fact: synonyms, paraphrases, minor misspellings, different word order, or extra correct detail. Reject answers that are wrong, too vague to show knowledge, or that miss the key part of the expected answer. Feedback: one short, friendly sentence addressed to the student.',
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
  explanation?: string;
  question?: string;
  deckTitle: string;
  model: ModelChoice;
}) {
  const ask = opts.question?.trim()
    ? `The student asks: ${opts.question}`
    : 'Explain this so it sticks: why the answer is correct, the key idea behind it, and one memory hook or example.';
  const res = await callClaude<string>({
    system:
      'You are a friendly, concise tutor inside a flashcard app. Answer in at most 150 words using short paragraphs or bullets in Markdown. No preamble.',
    prompt: `Deck: ${opts.deckTitle}\nFlashcard question: ${opts.front}\nAnswer: ${opts.back}${
      opts.explanation ? `\nCard note: ${opts.explanation}` : ''
    }\n\n${ask}`,
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
    system: CARD_WRITER,
    prompt:
      'For each flashcard below write 3 plausible distractors (wrong answers of the same type and length as the answer) and a 1-2 sentence explanation. Keep each id exactly.\n\n' +
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
