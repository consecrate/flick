// Bulk multiple-choice questions: the writing guide shared by the copyable
// prompt and Claude's in-app MCQ style, and the parser for the Markdown
// format that prompt asks for.

/** Most options a single question may have (keys 1-9 and 0 pick them). */
export const MAX_OPTIONS = 10;

/** A parsed question, ready to become a card. */
export interface McqInput {
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

/**
 * How to write a question that tests understanding (after getcracked-style
 * MCQ practice), and how to word hints and explanations so a newcomer can
 * follow them. Used verbatim in the copyable prompt and the in-app prompt.
 */
export const MCQ_GUIDE = `## How to write good questions
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
12. Not every question needs code. Use a code block only when the question is about code.

## How to write hints and explanations
Write for a smart student who is new to the subject. Use plain English, short sentences, active voice and literal words. Define each technical term the first time you use it. No filler, no metaphors, no "Great question".
- Hint: one sentence that points at the mechanism without giving away the answer.
- Explanation: first explain the mechanism that produces the correct answer, in 2 to 4 sentences. Then add one short line per wrong option that quotes the option and names the wrong belief that leads to it.`;

const FORMAT = `## Output format (strict)
Output only the questions, as plain Markdown. Do not put the whole answer inside a code block, and do not add any text before or after the questions.

Each question:
- starts with a line "## " followed by a short title (2 to 6 words)
- then the question text
- then, only if the question is about code, one fenced code block with a language tag (\`\`\`java, \`\`\`cpp, \`\`\`python, \`\`\`rust, \`\`\`sql, ...)
- then the options, one per line, written as "- [ ] wrong option" or "- [x] correct option", with exactly one [x]. Put code inside an option in \`backticks\`.
- then a line starting "Hint: "
- then a line starting "Explanation: ". The explanation may continue on the lines after it.

Example of one question:

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

/** The prompt a user pastes into Claude (or any chatbot) to get importable questions. */
export function buildMcqPrompt(opts: { topic?: string; count?: number; level?: string } = {}): string {
  const count = opts.count && opts.count > 0 ? opts.count : 15;
  const topic = opts.topic?.trim();
  const subject = topic
    ? `on this subject: ${topic}. If I attach or paste material below, base the questions on it.`
    : 'on the material I attach or paste below this prompt. If I give only a topic, use your own knowledge of it.';
  const lines = [
    'You are writing multiple-choice questions for Flick, a spaced-repetition quiz app. Flick imports your reply automatically, so follow the output format exactly.',
    '',
    '## Task',
    `Write ${count} multiple-choice questions ${subject}`,
  ];
  if (opts.level?.trim()) lines.push(`Target level: ${opts.level.trim()}.`);
  lines.push('', MCQ_GUIDE, '', FORMAT);
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
  let answerLetter = '';
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
        answerLetter = field[2].trim().replace(/[*_`()[\].]/g, '').charAt(0).toUpperCase();
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

  if (answerLetter && options.every((o) => !o.correct)) {
    const hit = options.find((o) => o.letter === answerLetter);
    if (hit) hit.correct = true;
  }

  const stem = question.join('\n').trim();
  if (!stem && !title) return 'has no question text';
  if (options.length < 2) return 'needs at least 2 options written as "- [ ] option"';
  if (options.length > MAX_OPTIONS) return `has ${options.length} options; the most is ${MAX_OPTIONS}`;
  const correct = options.filter((o) => o.correct);
  if (correct.length !== 1) return correct.length ? 'marks more than one option as correct; mark exactly one with [x]' : 'has no correct option; mark one with [x]';
  if (options.some((o) => !o.text)) return 'has an empty option';
  const seen = new Set<string>();
  for (const o of options) {
    const k = o.text.toLowerCase();
    if (seen.has(k)) return `lists the option "${o.text}" twice`;
    seen.add(k);
  }

  const codeText = code?.join('\n').replace(/^\n+|\s+$/g, '');
  return {
    title: stem && title ? title : undefined,
    question: stem || title,
    code: codeText || undefined,
    codeLang: codeText ? codeLang : undefined,
    answer: correct[0].text,
    distractors: options.filter((o) => !o.correct).map((o) => o.text),
    hint: hint.trim() || undefined,
    explanation: explanation.join('\n').trim() || undefined,
  };
}

/** Parse questions written in the format `buildMcqPrompt` asks for. */
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
