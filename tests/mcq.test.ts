import { describe, expect, it } from 'vitest';
import { MAX_OPTIONS, buildImportPrompt, parseMcqs } from '../shared/mcq.ts';
import { itemToCard } from '../server/ai.ts';

const SAMPLE = `## Calling a subclass method
In Java, what happens when you compile and run this program?

\`\`\`java
class Animal { void sound() {} }
## not a heading, this is inside the code block
\`\`\`

- [x] Compilation error
- [ ] Prints Woof, then Fetching
- [ ] Prints Woof, then throws an exception
- [ ] Prints ..., then Fetching
- [ ] Prints \`Woof\` twice

Hint: The compiler only knows the declared type of \`a\`.
Explanation: Java checks calls against the declared type.
- "Prints Woof, then Fetching": assumes the runtime type is checked.

## Big O of binary search
What is the worst-case number of comparisons binary search makes on a sorted array of n items, in Big O?
- [ ] O(n)
- [X] O(log n)
- [ ] O(1)
**Hint:** Each step halves the range.
`;

describe('parseMcqs', () => {
  it('parses questions with code, any number of options, hints and explanations', () => {
    const { questions, errors } = parseMcqs(SAMPLE);
    expect(errors).toEqual([]);
    expect(questions).toHaveLength(2);
    const [a, b] = questions;
    expect(a.title).toBe('Calling a subclass method');
    expect(a.question).toBe('In Java, what happens when you compile and run this program?');
    expect(a.codeLang).toBe('java');
    expect(a.code).toContain('## not a heading');
    expect(a.answer).toBe('Compilation error');
    expect(a.distractors).toHaveLength(4);
    expect(a.distractors).toContain('Prints `Woof` twice');
    expect(a.hint).toBe('The compiler only knows the declared type of `a`.');
    expect(a.explanation).toContain('- "Prints Woof, then Fetching"');
    expect(b.answer).toBe('O(log n)');
    expect(b.code).toBeUndefined();
    expect(b.hint).toBe('Each step halves the range.');
  });

  it('unwraps a reply the chatbot put inside a markdown fence', () => {
    const wrapped = '```markdown\n' + SAMPLE + '\n```\n';
    expect(parseMcqs(wrapped).questions).toHaveLength(2);
  });

  it('accepts lettered options with an Answer line', () => {
    const { questions, errors } = parseMcqs('## Q1. Rust moves\nWhat happens?\n\nA) It compiles\nB) Borrow error\nC) Panics\n\nAnswer: B\nExplanation: x was moved.');
    expect(errors).toEqual([]);
    expect(questions[0].title).toBe('Rust moves');
    expect(questions[0].answer).toBe('Borrow error');
    expect(questions[0].distractors).toEqual(['It compiles', 'Panics']);
  });

  it('normalizes language aliases and keeps the title as the question when there is no text', () => {
    const { questions } = parseMcqs('## What does this print?\n```c++\nint main(){}\n```\n- [x] 1\n- [ ] 2');
    expect(questions[0].codeLang).toBe('cpp');
    expect(questions[0].question).toBe('What does this print?');
    expect(questions[0].title).toBeUndefined();
  });

  it('reports broken questions without dropping good ones', () => {
    const many = Array.from({ length: MAX_OPTIONS + 1 }, (_, i) => `- [${i ? ' ' : 'x'}] option ${i}`).join('\n');
    const { questions, errors } = parseMcqs(
      `## No answer\nQ?\n- [ ] a\n- [ ] b\n\n## Two answers\nQ?\n- [x] a\n- [x] b\n\n## Too many\nQ?\n${many}\n\n## Duplicate\nQ?\n- [x] a\n- [ ] A\n\n## Fine\nQ?\n- [x] a\n- [ ] b`,
    );
    expect(questions.map((q) => q.title)).toEqual(['Fine']);
    expect(errors.map((e) => e.title)).toEqual(['No answer', 'Two answers', 'Too many', 'Duplicate']);
  });

  it('parses both examples inside its own prompt', () => {
    const prompt = buildImportPrompt({ topic: 'Java' });
    const examples = prompt.slice(prompt.indexOf('## Where the Krebs cycle runs'));
    const { questions, errors } = parseMcqs(examples.replace(/\nExample of a multiple-choice question:\n/, '\n'));
    expect(errors).toEqual([]);
    expect(questions).toHaveLength(2);
    expect(questions[0]).toMatchObject({ flashcard: true, answer: 'The mitochondrial matrix', distractors: ['The cytoplasm', 'The inner mitochondrial membrane', 'The nucleus'] });
    expect(questions[1].flashcard).toBeUndefined();
    expect(questions[1].answer).toBe('Compilation error');
    expect(questions[1].code).toContain('a.fetch();');
    expect(prompt).toContain('Write a mix of flashcards and multiple-choice questions about this subject: Java.');
    expect(prompt).not.toMatch(/Write \d+/);
  });

  it('reads a flashcard as an Answer line, with or without wrong answers', () => {
    const { questions, errors } = parseMcqs('## TCP handshake\nIn TCP, which segment does a client send first to open a connection?\n\n**Answer:** SYN\nExplanation: SYN asks the server to synchronize sequence numbers.\n\n## Bare\nIn Python, which keyword defines a generator function\'s yield point?\nAnswer: yield');
    expect(errors).toEqual([]);
    expect(questions[0]).toMatchObject({ flashcard: true, answer: 'SYN', distractors: [], explanation: 'SYN asks the server to synchronize sequence numbers.' });
    expect(questions[1]).toMatchObject({ flashcard: true, answer: 'yield' });
  });

  it('keeps a lettered answer as a multiple-choice question', () => {
    const { questions } = parseMcqs('## Q\nWhich?\nA) one\nB) two\nAnswer: A');
    expect(questions[0].flashcard).toBeUndefined();
    expect(questions[0].answer).toBe('one');
  });
});

describe('itemToCard', () => {
  const base = { title: 'T', question: 'Q?', code: '', language: '', answer: 'A', distractors: ['b', 'c', 'd', 'e'], hint: 'h', explanation: 'e' };
  it('maps a flashcard to a short-answer card with 3 distractors and no MCQ fields', () => {
    expect(itemToCard({ ...base, type: 'flashcard' })).toEqual({ front: 'Q?', back: 'A', distractors: ['b', 'c', 'd'], explanation: 'e', mcq: false, title: undefined, code: undefined, codeLang: undefined, hint: undefined });
  });
  it('maps a multiple-choice question with code', () => {
    const c = itemToCard({ ...base, type: 'mcq', code: 'int x;', language: 'C++' });
    expect(c).toMatchObject({ mcq: true, title: 'T', code: 'int x;', codeLang: 'cpp', hint: 'h', distractors: ['b', 'c', 'd', 'e'] });
  });
});
