# ⚡ Flick

Gamified AI flashcards that run on **your Claude Code subscription**, with **FSRS** spaced repetition underneath.

Drop in a PDF, photos of your notes, a web link, pasted notes, or just a topic. Claude writes quiz-ready flashcards, and you study them through quizzes, flashcards and arcade games with XP, levels, streaks, quests, chests, achievements and a shop. Flick is single player and runs locally.

## How it uses your subscription

Flick has no API key and no separate account. The local server runs the `claude` CLI in headless mode (`claude -p --output-format json --json-schema …`), so every AI request goes through whatever account Claude Code is logged into (Pro or Max).

- `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` are removed from the child process environment so Claude Code can't fall back to billing an API key. Set `FLICK_ALLOW_API_KEY=1` if you *want* API billing.
- Each call runs in an empty temp directory with `--strict-mcp-config`, `--no-session-persistence`, a Flick-specific system prompt and only the tools it needs: `Read` for uploaded files, `WebFetch` for links, otherwise none.
- Extended thinking is off by default (`MAX_THINKING_TOKENS=0`), which makes generation about 3× faster. You can turn it on in Settings.
- AI calls count toward your Claude usage limits like any other Claude Code use. Choose Haiku, Sonnet, Opus, Claude Code's own default model, or any custom model ID in Settings. Card writing and answer checking each have their own model setting.
- The server listens on `127.0.0.1` only, because it can run Claude Code on your behalf.

This is meant for personal use on your own machine.

## Quick start

Requirements: Node 20+ and [Claude Code](https://docs.claude.com/en/docs/claude-code) installed and logged in (run `claude` once).

```bash
npm install
npm start            # builds the UI and serves everything at http://localhost:4317
```

For development with hot reload:

```bash
npm run dev          # API on :4317, Vite on http://localhost:5173
npm test             # unit tests (game rules + FSRS)
npm run typecheck
```

Data lives in `~/.flick/data.json` (override with `FLICK_DATA_DIR`). Export and restore backups from Settings.

| Env var | Default | Purpose |
| --- | --- | --- |
| `FLICK_PORT` | `4317` | API/UI port |
| `FLICK_DATA_DIR` | `~/.flick` | Where your decks and progress are stored |
| `CLAUDE_BIN` | `claude` | Path to the Claude Code CLI |
| `FLICK_ALLOW_API_KEY` | unset | Set to `1` to let Claude Code use `ANTHROPIC_API_KEY` |

## Mac app

Flick also ships as a desktop app built with [Tauri](https://tauri.app). It runs the same UI and server as `npm start`: the server is compiled into a single binary with Bun and bundled inside the app, so the app needs no Node install. It still needs Claude Code installed and logged in.

**Install.** Download `Flick-macOS-AppleSilicon.dmg` (M1 and later) or `Flick-macOS-Intel.dmg` from the [latest release](https://github.com/consecrate/flick/releases/latest), open it and drag Flick to Applications. Every push to `main` publishes a new release. Builds for pull requests are in the **Desktop app** workflow runs in GitHub Actions.

**First launch.** The app is not signed with an Apple Developer ID yet, so macOS blocks it the first time. Run this once in Terminal, then open Flick normally:

```bash
xattr -dr com.apple.quarantine /Applications/Flick.app
```

(Alternatively: try to open it, then go to System Settings → Privacy & Security and click **Open Anyway**.)

The app uses the same data as the web version (`~/.flick`). It finds the `claude` CLI through your login shell's `PATH`, so if `claude` works in Terminal it works in the app.

**Auto-updates.** The app checks for a new release at launch and every 6 hours. When one exists it asks whether to update; on yes it downloads the new version, replaces itself and restarts. Updates are signed with a key that only the release workflow has, and the app rejects an update with a bad signature.

One-time setup for the repository owner, on your Mac:

```bash
npx tauri signer generate --ci -w ~/.tauri/flick.key   # makes flick.key and flick.key.pub (no password)
```

Then add two repository secrets under GitHub → Settings → Secrets and variables → Actions → New repository secret:

- `TAURI_SIGNING_PRIVATE_KEY`: the contents of `~/.tauri/flick.key`
- `TAURI_UPDATER_PUBKEY`: the contents of `~/.tauri/flick.key.pub`

Or, with the GitHub CLI: `gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/flick.key` and `gh secret set TAURI_UPDATER_PUBKEY < ~/.tauri/flick.key.pub`. Keep `flick.key` private and backed up: if it is lost, installed apps can't accept updates signed with a new key and need one manual reinstall. Without these secrets, the workflow still builds `.dmg` files but publishes no release.

**Building locally** (on a Mac, with Rust and Bun installed):

```bash
npm run app:dev      # run the app in development
npm run app:build    # build Flick.app and a .dmg into src-tauri/target/release/bundle
```

## Features

### Making cards (Gizmo-style "magic import")
- **Files**: PDFs (including slides exported to PDF), images or photos of handwritten notes, `.txt/.md/.csv/.html`, subtitles (`.srt/.vtt`). Claude reads PDFs and images itself with its `Read` tool.
- **Notes**: paste any text.
- **Web link**: Claude fetches the page with `WebFetch`.
- **Topic**: no material needed; Claude writes cards from its own knowledge.
- **Import list**: Quizlet exports, Anki plain-text exports, CSV, `term - definition`. Instant, no AI. Then use **Make quiz options with Claude** to generate multiple-choice distractors.
- **Paste from AI**: bulk-import cards written by any AI chat. Copy Flick's prompt, paste the reply, and Flick checks it as you paste. Multiple-choice questions can have 2 to 10 options, a code block in any language (syntax-highlighted), a hint and an explanation. Instant, no Claude Code call.
- **How many and which kind**: there is no card count. Claude (or the AI you paste from) writes as many cards as it takes to cover every idea in the material, and picks the better type per idea: a short-answer **flashcard** for facts, terms and reasons, or an exam-style **multiple-choice question** (with code when it fits) for mechanisms and "what happens" questions. The writing rules follow the anki-flashcards, cracked-mcq and explain skills and live in `shared/mcq.ts`.
- Options: focus and level. Every flashcard gets 3 plausible distractors and a short explanation.
- Each deck has a **Materials** tab listing every source and the cards made from it. Adding more material to a deck tells Claude to avoid duplicating existing cards.

#### Paste format
Each card starts with a `## ` title line. A **flashcard** has an `Answer:` line, optionally followed by wrong answers as `- [ ]` lines. A **multiple-choice question** has options with exactly one marked `[x]`. Flick shuffles options, so they must not refer to each other by letter.

```markdown
## Where the Krebs cycle runs
In eukaryotic cells, where does the Krebs cycle take place?

Answer: The mitochondrial matrix
- [ ] The cytoplasm
- [ ] The inner mitochondrial membrane

Explanation: The cycle's enzymes are dissolved in the matrix.
```

````markdown
## Calling a subclass method
In Java, what happens when you compile and run this program?

```java
Animal a = new Dog();
a.fetch();
```

- [x] Compilation error
- [ ] Prints Fetching
- [ ] Throws an exception at run time

Hint: The compiler only knows the declared type of `a`.
Explanation: Java checks calls against the declared type, and `Animal` has no `fetch()`.
````

Flick also accepts lettered options (`A) ...`) with an `Answer: B` line, and a reply wrapped in one outer code fence. The parser is in `shared/mcq.ts`.

### Studying
- **Quiz** (main mode): FSRS picks due cards first, then new cards up to your daily limit. New or shaky cards are asked as **multiple choice**. Once FSRS considers a card stable, it switches to **typed recall**. Missed cards come back once at the end of the session. You have 5 ❤️ per quiz, and can revive for coins.
- **Typed answers** are checked locally first, tolerating typos, articles and listed alternatives. Near misses go to Claude (the answer-checking model, Haiku by default) for a judgement automatically. For any wrong answer you can press **"I was right: ask Claude"** to appeal; if you win, you get the XP and the heart back.
- **Flashcards**: flip and self-rate Again/Hard/Good/Easy, with FSRS interval previews on each button.
- **Ask Claude**: a tutor chat on any card ("explain this", "give me a mnemonic"), available in feedback, in flashcards, and in the card list.

### How quiz answers map to FSRS
| Behaviour | Rating |
| --- | --- |
| Wrong | Again |
| Correct with a hint | Hard |
| Correct multiple choice (recognition) | Good |
| Correct typed answer, under 6s, on a known card | Easy |
| Other correct typed answers | Good |

Scheduling uses [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs) with configurable desired retention (default 90%), max interval, short-term learning steps and fuzz. Arcade modes never change your schedule.

### Gamification
- **XP and levels** with titles. Typed recall, new cards, combos and fast answers earn more; arcade answers earn half.
- **Combo meter**: 🔥 builds with consecutive correct answers, with bursts every 5.
- **Daily streak** with 🧊 streak freezes that cover missed days automatically.
- **Daily XP goal** (ring on the home screen). Reaching it unlocks a 🎁 **treasure chest** with coins, hints and sometimes a freeze.
- **Daily quests**: 3 random quests per day with coin rewards.
- **Coins**: 1 per 10 XP, plus quests and chests. Spend them in the **Shop** on streak freezes, hint packs, 🚀 Double XP (15 min), color themes and avatars.
- **Hints**: 50/50 for multiple choice, first-letter reveal for typed answers.
- **26 achievements** (trophies).
- **Arcade**
  - 🧩 **Match**: pair 6 questions with their answers against the clock (+2s per wrong pair). Personal best tracked.
  - ⏱️ **Time Attack**: 60 seconds of rapid multiple choice; +1s for each correct answer, −3s for each wrong one.
  - ⚔️ **Boss Fight**: a daily boss built from your hardest cards (most lapses, highest difficulty, lowest recall). Combos hit harder, with critical hits. 3 hearts.
- **Mastery tiers** per card from FSRS stability: New → Learning → Familiar → Proficient → Mastered. Decks show a mastery ring and a tier bar.
- **Stats**: XP heatmap, 14-day review forecast, true retention over 30 days, mastery distribution, and this week's XP against last week's.
- Synthesized sound effects (toggle in Settings), confetti, and floating XP.

## Project layout

```
server/   Express API: JSON store, Claude Code bridge, prompts, FSRS, game engine
shared/   Types and pure game rules used by both sides (XP, streaks, quests, shop…)
src/      React UI (Vite): pages, play modes, effects, sounds
tests/    Vitest unit tests
src-tauri/ Mac app shell (Tauri): starts the bundled server and opens a window on it
scripts/  build-server.mjs compiles server/ into the app's server binary
```
