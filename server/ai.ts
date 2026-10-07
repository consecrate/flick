// Prompts and schemas for every AI feature.

import type { ModelChoice } from '../shared/types.ts';
import { MCQ_GUIDE, normalizeLang } from '../shared/mcq.ts';
import { callClaude } from './claude.ts';

/** Plain-English rules for every explanation Claude writes for a student. */
const PLAIN_ENGLISH = `Write explanations for a smart student who is new to the subject: plain English, short sentences, active voice, literal words. Define a technical term the first time you use it. No filler ("basically", "it is important to note"), no decorative metaphors.`;

const CARD_WRITER = `You are Flick's flashcard author. You write spaced-repetition cards that a student will review for years, so a badly worded card costs them confusion at every review.

Before writing, read the whole source and decide what is worth remembering: the core facts, the relationships between them, and the reasons that explain them. Skip filler, asides and anything trivial to look up. Cover the most important ideas first.

Rules for every card:
- One idea per card. If an answer has two parts a student could recall separately, make two cards.
- The front asks one specific question with exactly one correct answer. Read it as someone who has forgotten the source: if a different answer would also be true, add constraints until only one fits. Never "Describe X" or "What do you know about X".
- The front stands alone. It will appear months later, shuffled among other decks, so name the subject when terms could mean something else ("In TCP, ...", "In Kant's ethics, ..."). Never refer to "the text", "the author", "this study" or "the above".
- The back is the short correct answer: ideally 1-8 words, never more than one sentence, answerable in under 10 seconds. Students may have to type it. Do not repeat words from the question in the answer.
- No enumerations ("What are the five X?"). Write one card per item with a prompt that picks out that item ("Which stage of mitosis follows metaphase?").
- No yes/no or true/false questions and no "Which is NOT" questions; ask an open question instead.
- Where the source explains a mechanism or a reason, write "why" and "how" cards, not only "what" cards. They build understanding and make the factual cards easier to keep.
- For an abstract idea, add a card that asks about a concrete example, and a card that separates it from the idea it is most often confused with. Word that card so the neighbouring concept is clearly a wrong answer.
- Give numbers and dates context: say why the number matters.
- "distractors": exactly 3 wrong answers for a multiple-choice version. Each one is the answer a student with a specific, common misunderstanding would give (a confusable term, a reversed cause and effect, a neighbouring value). Match the correct answer's type, length and style so it does not stand out. Never "All/None of the above".
- "explanation": 1-2 sentences that give the reason the answer is right, or the distinction that rules out the most tempting wrong answer. Do not restate the answer.
- No duplicates and no trivia about the document itself (page numbers, slide authors).
- Write in the same language as the source material.

${PLAIN_ENGLISH}`;

const MCQ_WRITER = `You are Flick's question author. You write hard, fair multiple-choice questions that test whether a student understands how something works, not whether they memorized a fact. Students review each question for months with spaced repetition.

${MCQ_GUIDE}

Field rules:
- "title": 2 to 6 words naming what the question is about.
- "question": the question text, with every assumption the answer depends on. Do not put the code here.
- "code": the code snippet when the question is about code, otherwise an empty string. "language": its language in lowercase (java, cpp, python, rust, sql, ...), otherwise an empty string.
- "answer": the correct option. "distractors": the wrong options (2 to 7), each the answer one named misconception produces.
- "hint": one sentence that points at the mechanism without giving the answer away.
- "explanation": the mechanism behind the correct answer (2 to 4 sentences), then one short line per wrong option, starting with the option in quotes, naming the belief that leads to it. Use Markdown: \`backticks\` for code, a "- " line per wrong option.
- Write in the same language as the source material.`;

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

interface GeneratedMcq {
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

const mcqSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    question: { type: 'string' },
    code: { type: 'string' },
    language: { type: 'string' },
    answer: { type: 'string' },
    distractors: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 7 },
    hint: { type: 'string' },
    explanation: { type: 'string' },
  },
  required: ['title', 'question', 'code', 'language', 'answer', 'distractors', 'hint', 'explanation'],
  additionalProperties: false,
};

function generationSchema(items: object) {
  return {
    type: 'object',
    properties: {
      deckTitle: { type: 'string', description: 'Short deck title (max 6 words)' },
      emoji: { type: 'string', description: 'One emoji that represents the subject' },
      description: { type: 'string', description: 'One-sentence deck description' },
      materialTitle: { type: 'string', description: 'Short title for this source material' },
      cards: { type: 'array', items },
    },
    required: ['deckTitle', 'emoji', 'description', 'materialTitle', 'cards'],
    additionalProperties: false,
  };
}

export interface GenerateInput {
  text?: string;
  topic?: string;
  url?: string;
  files?: { path: string; name: string }[];
  count: number;
  focus?: string;
  level?: string;
  existingFronts: string[];
  /** 'cards': short-answer flashcards. 'mcq': exam-style multiple choice, with code when it fits. */
  style?: 'cards' | 'mcq';
  model: ModelChoice;
  thinking?: boolean;
}

export async function generateCards(input: GenerateInput) {
  const mcq = input.style === 'mcq';
  const noun = mcq ? 'questions' : 'cards';
  const parts: string[] = [];
  const tools: string[] = [];
  const addDirs = new Set<string>();

  if (input.files?.length) {
    tools.push('Read');
    parts.push(
      `Source material is in these files. Read every one of them in full with the Read tool before writing ${noun}:\n` +
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
      `There is no source document. Write ${noun} about this topic from your own knowledge, covering the fundamentals a student should know first:\n<topic>${input.topic}</topic>`,
    );
  }
  parts.push(mcq ? `Write ${input.count} multiple-choice questions.` : `Write ${input.count} flashcards.`);
  if (input.focus) parts.push(`Focus on: ${input.focus}`);
  if (input.level) parts.push(`Target level: ${input.level}`);
  if (input.existingFronts.length) {
    parts.push(
      'The deck already has these questions. Do not repeat them; cover new ground:\n' +
        input.existingFronts.slice(0, 200).map((f) => `- ${f}`).join('\n'),
    );
  }
  parts.push('Respond only with the structured output.');

  const res = await callClaude<Omit<GenerationResult, 'cards'> & { cards: (GeneratedCard | GeneratedMcq)[] }>({
    prompt: parts.join('\n\n'),
    system: mcq ? MCQ_WRITER : CARD_WRITER,
    model: input.model,
    schema: generationSchema(mcq ? mcqSchema : cardSchema),
    tools,
    addDirs: [...addDirs],
    timeoutMs: 360_000,
    thinking: input.thinking,
  });
  const raw = res.data.cards ?? [];
  const cards: GeneratedCard[] = mcq
    ? (raw as GeneratedMcq[]).map((q) => ({
        front: q.question,
        back: q.answer,
        distractors: q.distractors,
        explanation: q.explanation,
        mcq: true,
        title: q.title,
        code: q.code,
        codeLang: q.code.trim() ? normalizeLang(q.language) : undefined,
        hint: q.hint,
      }))
    : (raw as GeneratedCard[]);
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
    system: `You are a friendly tutor inside a flashcard app. Assume the student is intelligent but new to the subject. ${PLAIN_ENGLISH} Use the same word for the same thing throughout. Answer in at most 180 words of Markdown: short paragraphs, bullets only for real lists, \`backticks\` for code. No preamble and no closing summary.`,
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
    system: CARD_WRITER,
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
