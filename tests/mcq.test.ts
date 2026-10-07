import { describe, expect, it } from 'vitest';
import { MAX_OPTIONS, buildMcqPrompt, parseMcqs } from '../shared/mcq.ts';

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

  it('parses the example inside its own prompt', () => {
    const prompt = buildMcqPrompt({ topic: 'Java', count: 5 });
    const example = prompt.slice(prompt.indexOf('## Calling a subclass method'));
    const { questions, errors } = parseMcqs(example);
    expect(errors).toEqual([]);
    expect(questions).toHaveLength(1);
    expect(questions[0].answer).toBe('Compilation error');
    expect(questions[0].code).toContain('a.fetch();');
    expect(prompt).toContain('Write 5 multiple-choice questions on this subject: Java.');
  });
});
