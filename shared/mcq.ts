// Cards written by AI: the writing guide shared by the copyable prompt and
// Claude's in-app generation, and the parser for the Markdown format the
// copyable prompt asks for. A reply can mix flashcards and multiple-choice
// questions.

/** Most options a single question may have (keys 1-9 and 0 pick them). */
export const MAX_OPTIONS = 10;

/** A parsed question, ready to become a card. */
export interface McqInput {
  /** Short-answer flashcard (no option marked correct) instead of an exam-style MCQ. */
  flashcard?: boolean;
  title?: string;
  question: string;
  code?: string;
  codeLang?: string;
  answer: string;
  distractors: string[];
  hint?: string;
  explanation?: string;
}

export interface McqParseResult {
  questions: McqInput[];
  /** One entry per question that could not be imported. */
  errors: { index: number; title: string; message: string }[];
}

// ---------- writing guide ----------

/** How much to write: every idea in the material, with no target count. */
export const COVERAGE_GUIDE = `## How many to write
There is no target number. Decide it from the material: write enough items that every idea worth remembering is tested at least once, and no more.
1. Read the whole material first. Make a private list of every idea worth remembering: core facts, definitions a student needs, relationships, causes and reasons, mechanisms, procedures, and common confusions. Skip filler, asides, and anything trivial to look up.
2. Write at least one item for each idea on the list. Short material may need 5 items; a dense chapter may need 60 or more.
3. Do not pad. Two items that test the same thing in the same direction are one item too many.
4. If there is no material, only a topic, cover the fundamentals a student should know first.
5. If the material is too long to cover in one reply (more than about 80 items), cover the most important ideas first. Never thin out the quality of each item to fit more in.`;

/** When to use a flashcard and when to use a multiple-choice question. */
export const TYPE_GUIDE = `## Flashcard or multiple choice
Pick the better type for each idea. Most sets need both.
- Use a **flashcard** when the student should be able to produce the answer from memory in a few words: a term, a definition, a fact, a name, a formula, a step in a process, the reason for something.
- Use a **multiple-choice question** when the idea is best tested by choosing between plausible answers that come from real misunderstandings: what code does, which statement about a mechanism is true, what happens in a scenario, a value to compute, which fix works. Use it also when the correct answer is too long to type.`;

/** Rules for short-answer flashcards (after the anki-flashcards skill). */
export const FLASHCARD_GUIDE = `## How to write good flashcards
A student will review each card for years, so a badly worded card costs them confusion at every review.
1. One idea per card. If an answer has two parts a student could recall separately, make two cards.
2. The question asks one specific thing with exactly one correct answer. Read it as someone who has forgotten the source: if a different answer would also be true, add constraints until only one fits. Never "Describe X" or "What do you know about X".
3. The question stands alone. It appears months later, shuffled among other subjects, so name the subject when terms could mean something else ("In TCP, ...", "In Kant's ethics, ..."). Never refer to "the text", "the author", "this study" or "the above".
4. The answer is short: ideally 1 to 8 words, never more than one sentence, answerable in under 10 seconds. Students may have to type it. Do not repeat words from the question in the answer.
5. No enumerations ("What are the five X?"). Write one card per item, with a prompt that picks out that item ("Which stage of mitosis follows metaphase?").
6. No yes/no or true/false questions, and no "Which is NOT" questions. Ask an open question instead.
7. Where the material explains a mechanism or a reason, write "why" and "how" cards, not only "what" cards.
8. For an abstract idea, add a card about a concrete example, and a card that separates it from the idea it is most often confused with.
9. Give numbers and dates context: say why the number matters.
10. Give each flashcard 3 wrong answers, used when the card is first quizzed as multiple choice. Each is the answer a student with a specific, common misunderstanding would give (a confusable term, a reversed cause and effect, a neighbouring value), with the same type, length and style as the correct answer.`;

/**
 * How to write a question that tests understanding (after getcracked-style
 * MCQ practice).
 */
export const MCQ_GUIDE = `## How to write good multiple-choice questions
Each question tests whether the student understands how something works, not whether they memorized a fact.

1. Build each question on one mechanism, not a topic. "Java inheritance" is a topic. "The declared type of a variable decides which methods the compiler lets you call; the object's real type decides which override runs" is a mechanism.
2. Before writing options, list the wrong beliefs that competent students actually hold about that mechanism. Each wrong option must be the answer that one specific wrong belief produces. If you cannot name the belief behind an option, replace the option.
3. Use as many options as there are real misconceptions: usually 4, up to 8 when there are more plausible wrong answers (for example, several different outputs a program could print). Never pad with filler. Never use "All of the above", "None of the above", or options that refer to other options by letter, because the app shuffles the options.
4. Keep the scenario minimal. For code, use the smallest snippet (usually 5 to 20 lines) where the correct model and each wrong model predict different results. Remove every line that does not help separate them.
5. State everything the answer depends on: language version, compiler, platform, input, units, whether a coin is fair. If behavior is undefined or implementation-defined, either pin it down or make that the correct option.
6. Exactly one option is correct. Read each question as someone who does not know the answer: could a second option be defended? If so, tighten the question.
7. Each question must stand alone, because the student sees it months later, mixed with other subjects. Name the subject when terms could mean something else ("In Java, ...", "In TCP, ..."). Never write "according to the text", "the author" or "the passage".
8. Reject trivia: version numbers, default values with no design reason, flag names, dates. A student who understands the concept, but never read that page of the manual, must be able to reason to the answer.
9. Keep options parallel: the same grammatical form and similar length, so the correct one does not stand out by being longer or more careful. Include "Compilation error" or "Undefined behavior" when either is a plausible belief, and make it the correct answer in some questions so students cannot rule it out by habit.
10. Verify every answer. Trace code line by line, or run it if you can. Work numeric and probability answers out exactly. If the check disagrees with your intended answer, fix the question, not the explanation.
11. Spread difficulty across the set, weighted toward medium and hard. Never test the same misconception twice. Mix question types: predict the output, does it compile, which fix works, which statement is true, compute a value, what goes wrong.
12. Not every question needs code. Use a code block only when the question is about code.`;

/** How to word hints and explanations so a newcomer can follow them (after the explain skill). */
export const EXPLANATION_GUIDE = `## How to write hints and explanations
Write for a smart student who is new to the subject. Use plain English, short sentences, active voice and literal words. Define each technical term the first time you use it. No filler, no metaphors, no "Great question".
- Flashcard explanation: 1 to 2 sentences that give the reason the answer is right, or the distinction that rules out the most tempting wrong answer. Do not restate the answer.
- Multiple-choice hint: one sentence that points at the mechanism without giving away the answer.
- Multiple-choice explanation: first explain the mechanism that produces the correct answer, in 2 to 4 sentences. Then add one short line per wrong option that quotes the option and names the wrong belief that leads to it.`;

/** Every writing rule, in the order a writer needs them. */
export const WRITING_GUIDE = [COVERAGE_GUIDE, TYPE_GUIDE, FLASHCARD_GUIDE, MCQ_GUIDE, EXPLANATION_GUIDE].join('\n\n');

const FORMAT = `## Output format (strict)
Output only the cards, as plain Markdown. Do not put the whole answer inside a code block, and do not add any text before or after the cards.

Every card starts with a line "## " followed by a short title (2 to 6 words), then the question text, then, only if the card is about code, one fenced code block with a language tag (\`\`\`java, \`\`\`cpp, \`\`\`python, \`\`\`rust, \`\`\`sql, ...).

A flashcard then has:
- a line starting "Answer: " with the short answer
- its 3 wrong answers, one per line, written as "- [ ] wrong answer"
- a line starting "Explanation: "

A multiple-choice question then has:
- the options, one per line, written as "- [ ] wrong option" or "- [x] correct option", with exactly one [x]. Put code inside an option in \`backticks\`.
- a line starting "Hint: "
- a line starting "Explanation: ". The explanation may continue on the lines after it.

Example of a flashcard:

## Where the Krebs cycle runs
In eukaryotic cells, where does the Krebs cycle take place?

Answer: The mitochondrial matrix
- [ ] The cytoplasm
- [ ] The inner mitochondrial membrane
- [ ] The nucleus

Explanation: The Krebs cycle's enzymes are dissolved in the matrix. The inner membrane holds the electron transport chain, which uses the cycle's products.

Example of a multiple-choice question:

## Calling a subclass method
In Java, what happens when you compile and run this program?

\`\`\`java
class Animal {
    void sound() { System.out.println("..."); }
}

class Dog extends Animal {
    void sound() { System.out.println("Woof"); }
    void fetch() { System.out.println("Fetching"); }
}

public class Main {
    public static void main(String[] args) {
        Animal a = new Dog();
        a.sound();
        a.fetch();
    }
}
\`\`\`

- [x] Compilation error
- [ ] Prints Woof, then Fetching
- [ ] Prints Woof, then throws an exception
- [ ] Prints ..., then Fetching

Hint: The compiler only knows the declared type of \`a\`.
Explanation: Java checks every method call at compile time against the variable's declared type. \`a\` is declared as \`Animal\`, and \`Animal\` has no \`fetch()\` method, so the program does not compile. The object's real type (\`Dog\`) only decides which version of \`sound()\` runs, and that matters only once the code compiles.
- "Prints Woof, then Fetching": assumes the compiler checks calls against the object's real type.
- "Prints Woof, then throws an exception": assumes a missing method is found at run time, as in Python.
- "Prints ..., then Fetching": assumes the declared type also picks which override runs.`;

/** The prompt a user pastes into Claude (or any chatbot) to get cards Flick can import. */
export function buildImportPrompt(opts: { topic?: string; level?: string } = {}): string {
  const topic = opts.topic?.trim();
  const subject = topic
    ? `about this subject: ${topic}. If I attach or paste material below, base the cards on it and cover all of it.`
    : 'that cover all of the material I attach or paste below this prompt. If I give only a topic, use your own knowledge of it.';
  const lines = [
    'You are writing study cards for Flick, a spaced-repetition quiz app. Flick imports your reply automatically, so follow the output format exactly.',
    '',
    '## Task',
    `Write a mix of flashcards and multiple-choice questions ${subject}`,
  ];
  if (opts.level?.trim()) lines.push(`Target level: ${opts.level.trim()}.`);
  lines.push('', WRITING_GUIDE, '', FORMAT);
  return lines.join('\n');
}

// ---------- parser ----------

const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)/;
const HEADING = /^#{1,4}\s+(.*)$/;
const CHECKBOX = /^\s*(?:[-*+]|\d+[.)])\s*\[([ xX✓✔])\]\s*(.*)$/;
const LETTERED = /^\s*(?:[-*+]\s*)?\(?([A-Ja-j])[.):]\s+(.*)$/;
const FIELD = /^\s*(?:\*\*|__)?\s*(hint|explanation|why|answer|correct answer)\s*(?:\*\*|__)?\s*[:：]\s*(?:\*\*|__)?\s*(.*)$/i;

/** Common ways people and chatbots spell a code block's language. */
const LANG_ALIASES: Record<string, string> = {
  'c++': 'cpp',
  cc: 'cpp',
  hpp: 'cpp',
  'c#': 'csharp',
  cs: 'csharp',
  js: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  py3: 'python',
  rs: 'rust',
  golang: 'go',
  sh: 'bash',
  zsh: 'bash',
  shell: 'bash',
  kt: 'kotlin',
  rb: 'ruby',
  sv: 'verilog',
  systemverilog: 'verilog',
  asm: 'x86asm',
  objc: 'objectivec',
  yml: 'yaml',
  text: 'plaintext',
  txt: 'plaintext',
};

export function normalizeLang(lang: string | undefined): string | undefined {
  const l = lang?.trim().toLowerCase();
  if (!l) return undefined;
  return LANG_ALIASES[l] ?? l;
}

/** Remove a fence the chatbot wrapped around its whole reply, if there is one. */
function unwrap(lines: string[]): string[] {
  const first = lines.findIndex((l) => l.trim());
  let last = lines.length - 1;
  while (last > first && !lines[last].trim()) last--;
  if (first < 0) return lines;
  const open = lines[first].trim().match(/^(`{3,}|~{3,})\s*(markdown|md|text|txt)?$/i);
  if (!open || !/^(`{3,}|~{3,})$/.test(lines[last].trim()) || last === first) return lines;
  // Only unwrap when the first heading comes right after the opening fence.
  const next = lines.slice(first + 1).find((l) => l.trim());
  if (!next || !HEADING.test(next)) return lines;
  return lines.slice(first + 1, last);
}

function stripTitle(t: string): string {
  return t
    .replace(/[*_]{2}/g, '')
    .replace(/^(question|q)\s*\d*\s*[:.)-]?\s*/i, '')
    .replace(/^\d+\s*[:.)-]\s*/, '')
    .trim();
}

/** Split the text into one chunk per "## heading", ignoring headings inside code blocks. */
function splitQuestions(lines: string[]): { title: string; body: string[] }[] {
  const out: { title: string; body: string[] }[] = [];
  let fence: string | null = null;
  for (const line of lines) {
    const f = line.match(FENCE);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (line.trim().startsWith(fence) && !f[2]) fence = null;
    }
    const h = !fence && !f ? line.match(HEADING) : null;
    if (h) out.push({ title: stripTitle(h[1]), body: [] });
    else if (out.length) out[out.length - 1].body.push(line);
  }
  return out;
}

function cleanOption(s: string): string {
  return s.trim();
}

function parseOne(title: string, body: string[]): McqInput | string {
  const question: string[] = [];
  let code: string[] | null = null;
  let codeLang: string | undefined;
  const options: { text: string; correct: boolean; letter?: string }[] = [];
  let hint = '';
  const explanation: string[] = [];
  let answerText = '';
  let section: 'question' | 'options' | 'hint' | 'explanation' = 'question';
  let fenceChar: string | null = null;
  let fenceTarget: string[] | null = null;

  for (const raw of body) {
    const line = raw.replace(/\s+$/, '');
    const f = line.match(FENCE);
    // Inside a fenced block: copy lines until the closing fence.
    if (fenceChar) {
      if (f && line.trim().startsWith(fenceChar) && !f[2]) {
        fenceChar = null;
        if (fenceTarget !== code) fenceTarget!.push(line);
        fenceTarget = null;
      } else fenceTarget!.push(line);
      continue;
    }
    if (f) {
      fenceChar = f[1][0];
      if (section === 'question' && code === null) {
        code = [];
        codeLang = normalizeLang(f[2]);
        fenceTarget = code;
      } else {
        // Code inside an explanation (or a second block) stays as Markdown text.
        fenceTarget = section === 'question' ? question : explanation;
        fenceTarget.push(line);
      }
      continue;
    }

    const field = line.match(FIELD);
    if (field && section !== 'explanation') {
      const key = field[1].toLowerCase();
      if (key === 'hint') {
        section = 'hint';
        hint = field[2].trim();
      } else if (key === 'answer' || key === 'correct answer') {
        answerText = field[2].trim().replace(/^(\*\*|__)|(\*\*|__)$/g, '').trim();
      } else {
        section = 'explanation';
        if (field[2].trim()) explanation.push(field[2].trim());
      }
      continue;
    }
    if (field && section === 'explanation' && /^(hint)$/i.test(field[1])) {
      hint ||= field[2].trim();
      continue;
    }
    if (section === 'explanation') {
      explanation.push(line);
      continue;
    }

    const cb = line.match(CHECKBOX);
    if (cb && (section === 'question' || section === 'options')) {
      section = 'options';
      options.push({ text: cleanOption(cb[2]), correct: cb[1] !== ' ' });
      continue;
    }
    const le = line.match(LETTERED);
    if (le && (section === 'question' || section === 'options') && options.every((o) => o.letter)) {
      // Lettered options ("A) ...") only count when they run in order A, B, C...
      const expected = String.fromCharCode(65 + options.length);
      if (le[1].toUpperCase() === expected) {
        section = 'options';
        options.push({ text: cleanOption(le[2]), correct: false, letter: expected });
        continue;
      }
    }
    if (section === 'options') {
      // An indented line continues the previous option; anything else is ignored.
      if (line.trim() && /^\s{2,}/.test(raw) && options.length) options[options.length - 1].text += ' ' + line.trim();
      continue;
    }
    if (section === 'hint') {
      if (line.trim()) hint += (hint ? ' ' : '') + line.trim();
      continue;
    }
    question.push(line);
  }

  // Lettered options ("A) ...") name their correct one on an "Answer: B" line.
  const letter = answerText.match(/^\(?([A-Ja-j])(?:[.):]|\s|$)/)?.[1]?.toUpperCase();
  if (letter && options.length && options.every((o) => o.letter && !o.correct)) {
    const hit = options.find((o) => o.letter === letter);
    if (hit) hit.correct = true;
  }

  const stem = question.join('\n').trim();
  if (!stem && !title) return 'has no question text';
  const codeText = code?.join('\n').replace(/^\n+|\s+$/g, '');
  const base = {
    title: stem && title ? title : undefined,
    question: stem || title,
    code: codeText || undefined,
    codeLang: codeText ? codeLang : undefined,
    hint: hint.trim() || undefined,
    explanation: explanation.join('\n').trim() || undefined,
  };

  // No option marked correct but an "Answer:" line: a flashcard. Its unchecked
  // options, if any, are wrong answers for its multiple-choice round.
  if (answerText && !options.some((o) => o.correct) && !options.some((o) => o.letter)) {
    const wrong = options.map((o) => o.text).filter((t) => t && t.toLowerCase() !== answerText.toLowerCase());
    return { ...base, flashcard: true, answer: answerText, distractors: [...new Set(wrong)].slice(0, 3) };
  }

  if (options.length < 2) return answerText ? 'has an "Answer:" line but its options are not marked; mark the correct one with [x]' : 'needs an "Answer:" line or at least 2 options written as "- [ ] option"';
  if (options.length > MAX_OPTIONS) return `has ${options.length} options; the most is ${MAX_OPTIONS}`;
  const correct = options.filter((o) => o.correct);
  if (correct.length !== 1) return correct.length ? 'marks more than one option as correct; mark exactly one with [x]' : 'has no correct option; mark one with [x], or add an "Answer:" line for a flashcard';
  if (options.some((o) => !o.text)) return 'has an empty option';
  const seen = new Set<string>();
  for (const o of options) {
    const k = o.text.toLowerCase();
    if (seen.has(k)) return `lists the option "${o.text}" twice`;
    seen.add(k);
  }

  return { ...base, answer: correct[0].text, distractors: options.filter((o) => !o.correct).map((o) => o.text) };
}

/** Parse cards written in the format `buildImportPrompt` asks for. */
export function parseMcqs(text: string): McqParseResult {
  const lines = unwrap(text.replace(/\r\n?/g, '\n').split('\n'));
  const chunks = splitQuestions(lines);
  const result: McqParseResult = { questions: [], errors: [] };
  chunks.forEach((c, i) => {
    const q = parseOne(c.title, c.body);
    if (typeof q === 'string') result.errors.push({ index: i + 1, title: c.title || `Question ${i + 1}`, message: q });
    else result.questions.push(q);
  });
  return result;
}
