import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ACHIEVEMENTS, SHOP, addDays, checkAchievements, effectiveStreak, levelInfo, localDay, masteryTier, rollChest } from '../shared/game.ts';
import { isValidModel, type Card, type Deck, type Material, type SessionComplete, type Settings, type AnswerRequest } from '../shared/types.ts';
import { explainCard, generateCards, gradeAnswer, makeDistractors, parsePairs } from './ai.ts';
import { ClaudeError, UPLOAD_DIR, callClaude, claudeVersion } from './claude.ts';
import { DATA_DIR, db, replaceAll, save, uid, type Data } from './db.ts';
import {
  BOSS_MIN_CARDS,
  aheadQueue,
  applyAnswer,
  bossQueue,
  completeSession,
  deckCards,
  ensureQuests,
  practiceQueue,
  studyQueue,
  summarizeDeck,
} from './game.ts';
import { isDue, newSrs, preview, retrievability } from './srs.ts';

const app = express();
app.use(express.json({ limit: '60mb' }));

type Handler = (req: Request, res: Response) => unknown;
const wrap = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res)).catch(next);
};

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function dayOf(req: Request): string {
  const d = (req.query.day as string) || (req.body?.day as string);
  return /^\d{4}-\d{2}-\d{2}$/.test(d ?? '') ? d : localDay();
}

function findDeck(id: string): Deck {
  const d = db.decks.find((x) => x.id === id);
  if (!d) throw new HttpError(404, 'Deck not found');
  return d;
}

function findCard(id: string): Card {
  const c = db.cards.find((x) => x.id === id);
  if (!c) throw new HttpError(404, 'Card not found');
  return c;
}

const DECK_COLORS = ['#7c5cff', '#22d3ee', '#f472b6', '#34d399', '#fbbf24', '#fb7185', '#60a5fa', '#a3e635', '#f97316'];

function createDeck(title: string, emoji = '📘', description = ''): Deck {
  const deck: Deck = {
    id: uid(),
    title: title.trim() || 'Untitled deck',
    emoji: emoji || '📘',
    description,
    color: DECK_COLORS[db.decks.length % DECK_COLORS.length],
    createdAt: new Date().toISOString(),
  };
  db.decks.push(deck);
  db.profile.stats.decksCreated++;
  return deck;
}

function addCard(deckId: string, c: { front: string; back: string; distractors?: string[]; explanation?: string }, materialId?: string): Card {
  const card: Card = {
    id: uid(),
    deckId,
    front: c.front.trim(),
    back: c.back.trim(),
    distractors: (c.distractors ?? []).map((d) => d.trim()).filter((d) => d && d !== c.back.trim()).slice(0, 3),
    explanation: c.explanation?.trim() || undefined,
    materialId,
    createdAt: new Date().toISOString(),
    srs: newSrs(),
  };
  db.cards.push(card);
  db.profile.stats.cardsCreated++;
  return card;
}

function cardView(c: Card, now = new Date()) {
  return { ...c, tier: masteryTier(c.srs), recall: retrievability(c.srs, db.settings, now), due: isDue(c.srs, now) };
}

// ---------- status ----------

app.get(
  '/api/health',
  wrap(async (_req, res) => {
    res.json({ ok: true, claude: await claudeVersion(), dataDir: DATA_DIR });
  }),
);

app.post(
  '/api/claude/test',
  wrap(async (_req, res) => {
    const r = await callClaude<string>({
      system: 'Reply with one short upbeat sentence.',
      prompt: 'Say hi to a student who just connected their flashcard app to Claude.',
      // Test the configured model so a typo in a custom model ID shows up here.
      model: db.settings.model,
      timeoutMs: 60_000,
    });
    res.json({ ok: true, message: r.text, durationMs: r.durationMs, models: r.models });
  }),
);

app.get('/api/state', (req, res) => {
  const day = dayOf(req);
  ensureQuests(day);
  const p = db.profile;
  const now = new Date();
  const active = db.cards.filter((c) => !c.suspended);
  res.json({
    profile: { ...p, streak: { ...p.streak, current: effectiveStreak(p.streak, day) } },
    level: levelInfo(p.xp),
    settings: db.settings,
    decks: db.decks.map((d) => summarizeDeck(d.id)),
    dueTotal: active.filter((c) => isDue(c.srs, now)).length,
    newTotal: active.filter((c) => c.srs.state === 0).length,
    todayXp: p.dailyXp[day] ?? 0,
    chestAvailable: (p.dailyXp[day] ?? 0) >= db.settings.dailyGoalXp && !p.chestDays.includes(day),
    chestOpenedToday: p.chestDays.includes(day),
    streakAtRisk: p.streak.lastDay !== day && effectiveStreak(p.streak, day) > 0,
    doubleXpActive: !!p.doubleXpUntil && new Date(p.doubleXpUntil).getTime() > Date.now(),
  });
});

// ---------- decks & cards ----------

app.post('/api/decks', (req, res) => {
  const deck = createDeck(String(req.body.title ?? ''), req.body.emoji, String(req.body.description ?? ''));
  checkAchievements(db.profile);
  save();
  res.json(summarizeDeck(deck.id));
});

app.get(
  '/api/decks/:id',
  wrap((req, res) => {
    const deck = findDeck(req.params.id as string);
    const now = new Date();
    res.json({
      deck: summarizeDeck(deck.id),
      cards: db.cards.filter((c) => c.deckId === deck.id).map((c) => cardView(c, now)),
      materials: db.materials.filter((m) => m.deckId === deck.id).sort((a, b) => b.addedAt.localeCompare(a.addedAt)),
      bossMinCards: BOSS_MIN_CARDS,
    });
  }),
);

app.patch(
  '/api/decks/:id',
  wrap((req, res) => {
    const deck = findDeck(req.params.id as string);
    for (const k of ['title', 'emoji', 'description', 'color'] as const) {
      if (typeof req.body[k] === 'string') deck[k] = req.body[k];
    }
    save();
    res.json(summarizeDeck(deck.id));
  }),
);

app.delete(
  '/api/decks/:id',
  wrap((req, res) => {
    const deck = findDeck(req.params.id as string);
    db.decks = db.decks.filter((d) => d.id !== deck.id);
    db.cards = db.cards.filter((c) => c.deckId !== deck.id);
    db.materials = db.materials.filter((m) => m.deckId !== deck.id);
    save();
    res.json({ ok: true });
  }),
);

app.post(
  '/api/decks/:id/cards',
  wrap((req, res) => {
    const deck = findDeck(req.params.id as string);
    const { front, back } = req.body ?? {};
    if (!String(front ?? '').trim() || !String(back ?? '').trim()) throw new HttpError(400, 'Front and back are required');
    const card = addCard(deck.id, req.body);
    save();
    res.json(cardView(card));
  }),
);

app.patch(
  '/api/cards/:id',
  wrap((req, res) => {
    const card = findCard(req.params.id as string);
    const b = req.body ?? {};
    if (typeof b.front === 'string' && b.front.trim()) card.front = b.front.trim();
    if (typeof b.back === 'string' && b.back.trim()) card.back = b.back.trim();
    if (typeof b.explanation === 'string') card.explanation = b.explanation.trim() || undefined;
    if (Array.isArray(b.distractors)) card.distractors = b.distractors.map(String).map((s: string) => s.trim()).filter(Boolean).slice(0, 3);
    if (typeof b.starred === 'boolean') card.starred = b.starred;
    if (typeof b.suspended === 'boolean') card.suspended = b.suspended;
    save();
    res.json(cardView(card));
  }),
);

app.post(
  '/api/cards/:id/reset',
  wrap((req, res) => {
    const card = findCard(req.params.id as string);
    card.srs = newSrs();
    save();
    res.json(cardView(card));
  }),
);

app.delete(
  '/api/cards/:id',
  wrap((req, res) => {
    const card = findCard(req.params.id as string);
    db.cards = db.cards.filter((c) => c.id !== card.id);
    save();
    res.json({ ok: true });
  }),
);

app.delete(
  '/api/materials/:id',
  wrap((req, res) => {
    const id = req.params.id as string;
    const removeCards = req.query.cards === '1';
    db.materials = db.materials.filter((m) => m.id !== id);
    if (removeCards) db.cards = db.cards.filter((c) => c.materialId !== id);
    save();
    res.json({ ok: true });
  }),
);

// ---------- AI ----------

const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|html?|tex|rtf|srt|vtt)$/i;
const CLAUDE_READABLE = /\.(pdf|png|jpe?g|gif|webp|ipynb)$/i;

interface UploadedFile {
  name: string;
  data: string; // base64
}

app.post(
  '/api/generate',
  wrap(async (req, res) => {
    const b = req.body ?? {};
    const source = b.source ?? {};
    const count = Math.max(3, Math.min(60, Number(b.count) || 15));
    let deck = b.deckId ? findDeck(b.deckId) : null;
    const existingFronts = deck ? db.cards.filter((c) => c.deckId === deck!.id).map((c) => c.front) : [];

    // Plain term/definition lists import instantly without AI.
    if (source.type === 'pairs') {
      const pairs = parsePairs(String(source.text ?? ''));
      if (!pairs.length) throw new HttpError(400, 'Could not find term/definition pairs. Put one per line, separated by a tab, " - ", ":" or a comma.');
      deck ??= createDeck(String(b.title ?? '') || 'Imported deck', '📥');
      const mat = addMaterial(deck.id, 'import', `Imported list (${pairs.length})`, pairs.slice(0, 3).map((p) => p.front).join(' · '));
      const added = pairs.map((p) => addCard(deck!.id, p, mat.id));
      mat.cardCount = added.length;
      save();
      res.json({ deck: summarizeDeck(deck.id), added: added.length, material: mat, needsDistractors: true, newAchievements: checkAchievements(db.profile) });
      return;
    }

    let text: string | undefined;
    const files: { path: string; name: string }[] = [];
    let title = '';
    let preview = '';

    if (source.type === 'text') {
      text = String(source.text ?? '').trim();
      if (!text) throw new HttpError(400, 'Paste some notes first');
      preview = text.slice(0, 160);
    } else if (source.type === 'topic') {
      if (!String(source.topic ?? '').trim()) throw new HttpError(400, 'Enter a topic');
      preview = String(source.topic).slice(0, 160);
      title = String(source.topic).slice(0, 60);
    } else if (source.type === 'url') {
      if (!/^https?:\/\//i.test(String(source.url ?? ''))) throw new HttpError(400, 'Enter a full http(s) URL');
      preview = source.url;
      title = source.url;
    } else if (source.type === 'files') {
      const uploads = (source.files ?? []) as UploadedFile[];
      if (!uploads.length) throw new HttpError(400, 'Choose at least one file');
      const texts: string[] = [];
      for (const f of uploads) {
        const buf = Buffer.from(f.data, 'base64');
        if (TEXT_EXT.test(f.name)) texts.push(`--- ${f.name} ---\n${buf.toString('utf8')}`);
        else if (CLAUDE_READABLE.test(f.name)) {
          const safe = f.name.replace(/[^\w.-]+/g, '_').slice(-80);
          const p = path.join(UPLOAD_DIR, `${uid()}-${safe}`);
          fs.writeFileSync(p, buf);
          files.push({ path: p, name: f.name });
        } else throw new HttpError(400, `Unsupported file type: ${f.name}. Use PDF, images, or text files.`);
      }
      if (texts.length) text = texts.join('\n\n');
      title = uploads.map((f) => f.name).join(', ');
      preview = title;
    } else {
      throw new HttpError(400, 'Unknown source type');
    }

    try {
      const out = await generateCards({
        text,
        files,
        topic: source.type === 'topic' ? String(source.topic) : undefined,
        url: source.type === 'url' ? String(source.url) : undefined,
        count,
        focus: b.focus ? String(b.focus) : undefined,
        level: b.level ? String(b.level) : undefined,
        existingFronts,
        model: db.settings.model,
        thinking: db.settings.thinking,
      });
      if (!out.cards.length) throw new HttpError(502, 'Claude did not return any cards. Try different material.');
      deck ??= createDeck(out.deckTitle, out.emoji, out.description);
      const mat = addMaterial(deck.id, source.type === 'files' ? 'file' : source.type, out.materialTitle || title || 'Notes', preview);
      const added = out.cards.map((c) => addCard(deck!.id, c, mat.id));
      mat.cardCount = added.length;
      db.profile.stats.aiGenerations++;
      const newAchievements = checkAchievements(db.profile);
      save();
      res.json({ deck: summarizeDeck(deck.id), added: added.length, material: mat, costUsd: out.costUsd, newAchievements });
    } finally {
      for (const f of files) fs.rm(f.path, { force: true }, () => {});
    }
  }),
);

function addMaterial(deckId: string, kind: Material['kind'], title: string, preview: string): Material {
  const m: Material = { id: uid(), deckId, kind, title: title.slice(0, 120), preview: preview.slice(0, 200), addedAt: new Date().toISOString(), cardCount: 0 };
  db.materials.push(m);
  return m;
}

app.post(
  '/api/decks/:id/enhance',
  wrap(async (req, res) => {
    const deck = findDeck(req.params.id as string);
    const todo = db.cards.filter((c) => c.deckId === deck.id && c.distractors.length < 3);
    let updated = 0;
    for (let i = 0; i < todo.length; i += 25) {
      const batch = todo.slice(i, i + 25);
      const items = await makeDistractors({ cards: batch.map((c) => ({ id: c.id, front: c.front, back: c.back })), model: db.settings.model });
      for (const it of items) {
        const card = batch.find((c) => c.id === it.id);
        if (!card) continue;
        card.distractors = it.distractors.map((d) => d.trim()).filter((d) => d && d !== card.back).slice(0, 3);
        if (!card.explanation && it.explanation) card.explanation = it.explanation;
        updated++;
      }
      save();
    }
    res.json({ updated });
  }),
);

app.post(
  '/api/explain',
  wrap(async (req, res) => {
    const card = findCard(String(req.body.cardId));
    const deck = findDeck(card.deckId);
    const text = await explainCard({
      front: card.front,
      back: card.back,
      explanation: card.explanation,
      question: req.body.question ? String(req.body.question) : undefined,
      deckTitle: deck.title,
      model: db.settings.model === 'opus' ? 'sonnet' : db.settings.model,
    });
    res.json({ text });
  }),
);

app.post(
  '/api/grade',
  wrap(async (req, res) => {
    const card = findCard(String(req.body.cardId));
    const given = String(req.body.given ?? '').trim();
    if (!given) throw new HttpError(400, 'Empty answer');
    const verdict = await gradeAnswer({ question: card.front, expected: card.back, given, model: db.settings.gradingModel });
    if (verdict.correct) {
      db.profile.stats.appeals++;
      save();
    }
    res.json(verdict);
  }),
);

// ---------- study ----------

app.get(
  '/api/study',
  wrap((req, res) => {
    const day = dayOf(req);
    const deckId = (req.query.deckId as string) || null;
    if (deckId) findDeck(deckId);
    const mode = String(req.query.mode ?? 'quiz');
    const size = Math.max(4, Math.min(50, Number(req.query.size) || db.settings.sessionSize));
    let cards: Card[];
    let ahead = false;
    if (mode === 'quiz' || mode === 'flashcards') {
      cards = studyQueue(deckId, day, size);
      if (!cards.length && req.query.ahead === '1') {
        cards = aheadQueue(deckId, size);
        ahead = true;
      }
    } else if (mode === 'boss') cards = bossQueue(deckId, 10);
    else if (mode === 'match') cards = practiceQueue(deckId, 6);
    else cards = practiceQueue(deckId, 200);

    // Pool of other answers in the deck, used to build MCQ options for cards without distractors.
    const pool = [...new Set(deckCards(deckId).map((c) => c.back))].slice(0, 300);
    const now = new Date();
    res.json({
      cards: cards.map((c) => ({ ...cardView(c, now), previews: mode === 'flashcards' ? preview(c.srs, db.settings, now) : undefined })),
      pool,
      ahead,
      deck: deckId ? summarizeDeck(deckId) : null,
    });
  }),
);

app.post(
  '/api/answer',
  wrap((req, res) => {
    const body = req.body as AnswerRequest;
    if (!body?.answer?.cardId) throw new HttpError(400, 'Missing answer');
    const result = applyAnswer({ ...body, day: dayOf(req) });
    res.json({ ...result, card: result.card ? cardView(result.card) : null });
  }),
);

app.post('/api/session/complete', (req, res) => {
  res.json(completeSession({ ...(req.body as SessionComplete), day: dayOf(req) }));
});

// ---------- economy ----------

app.post(
  '/api/quests/:id/claim',
  wrap((req, res) => {
    const q = db.profile.quests.list.find((x) => x.id === req.params.id);
    if (!q) throw new HttpError(404, 'Quest not found');
    if (q.claimed || q.progress < q.target) throw new HttpError(400, 'Quest not complete');
    q.claimed = true;
    db.profile.coins += q.reward;
    save();
    res.json({ coins: q.reward });
  }),
);

app.post(
  '/api/chest/open',
  wrap((req, res) => {
    const day = dayOf(req);
    const p = db.profile;
    if (p.chestDays.includes(day)) throw new HttpError(400, 'Already opened today');
    if ((p.dailyXp[day] ?? 0) < db.settings.dailyGoalXp) throw new HttpError(400, 'Reach your daily goal first');
    const loot = rollChest(`${day}:${p.xp}`);
    p.chestDays.push(day);
    p.coins += loot.coins;
    p.hints += loot.hints;
    if (loot.freeze) p.streak.freezes = Math.min(3, p.streak.freezes + 1);
    p.stats.chestsOpened++;
    const newAchievements = checkAchievements(p);
    save();
    res.json({ ...loot, newAchievements });
  }),
);

app.post(
  '/api/shop/buy',
  wrap((req, res) => {
    const item = SHOP.find((i) => i.id === req.body.itemId);
    if (!item) throw new HttpError(404, 'Item not found');
    const p = db.profile;
    if ((item.kind === 'theme' || item.kind === 'avatar') && (p.owned.includes(item.id) || item.price === 0)) {
      throw new HttpError(400, 'You already own this');
    }
    if (item.id === 'freeze' && p.streak.freezes >= (item.max ?? 3)) throw new HttpError(400, 'You already hold the maximum number of freezes');
    if (p.coins < item.price) throw new HttpError(400, 'Not enough coins');
    p.coins -= item.price;
    if (item.id === 'freeze') p.streak.freezes++;
    else if (item.id === 'hints5') p.hints += 5;
    else if (item.id === 'double-xp') {
      const base = Math.max(Date.now(), p.doubleXpUntil ? new Date(p.doubleXpUntil).getTime() : 0);
      p.doubleXpUntil = new Date(base + 15 * 60_000).toISOString();
    } else {
      p.owned.push(item.id);
      if (item.kind === 'theme') p.theme = item.id;
      if (item.kind === 'avatar') p.avatar = String(item.value);
    }
    p.stats.purchases++;
    const newAchievements = checkAchievements(p);
    save();
    res.json({ ok: true, newAchievements });
  }),
);

app.post(
  '/api/spend',
  wrap((req, res) => {
    const p = db.profile;
    const what = req.body.what;
    if (what === 'hint') {
      if (p.hints <= 0) throw new HttpError(400, 'No hints left. Buy more in the shop.');
      p.hints--;
    } else if (what === 'revive') {
      if (p.coins < 25) throw new HttpError(400, 'Not enough coins to revive');
      p.coins -= 25;
    } else throw new HttpError(400, 'Unknown spend');
    save();
    res.json({ hints: p.hints, coins: p.coins });
  }),
);

app.post(
  '/api/profile',
  wrap((req, res) => {
    const p = db.profile;
    const b = req.body ?? {};
    if (typeof b.name === 'string' && b.name.trim()) p.name = b.name.trim().slice(0, 30);
    if (typeof b.theme === 'string') {
      const item = SHOP.find((i) => i.id === b.theme && i.kind === 'theme');
      if (!item || (item.price > 0 && !p.owned.includes(item.id))) throw new HttpError(400, 'Theme not owned');
      p.theme = item.id;
    }
    if (typeof b.avatar === 'string') {
      const item = SHOP.find((i) => i.kind === 'avatar' && i.value === b.avatar);
      if (b.avatar !== '⚡' && (!item || !p.owned.includes(item.id))) throw new HttpError(400, 'Avatar not owned');
      p.avatar = b.avatar;
    }
    save();
    res.json({ ok: true });
  }),
);

app.patch('/api/settings', (req, res) => {
  const s = db.settings;
  const b = req.body as Partial<Settings>;
  for (const m of [b.model, b.gradingModel]) {
    if (m !== undefined && !isValidModel(m)) throw new HttpError(400, `Invalid model name: ${String(m).slice(0, 100)}`);
  }
  if (b.model) s.model = b.model;
  if (b.gradingModel) s.gradingModel = b.gradingModel;
  if (typeof b.desiredRetention === 'number') s.desiredRetention = Math.min(0.97, Math.max(0.7, b.desiredRetention));
  if (typeof b.newPerDay === 'number') s.newPerDay = Math.max(0, Math.min(500, Math.round(b.newPerDay)));
  if (typeof b.sessionSize === 'number') s.sessionSize = Math.max(4, Math.min(50, Math.round(b.sessionSize)));
  if (typeof b.dailyGoalXp === 'number') s.dailyGoalXp = Math.max(20, Math.min(2000, Math.round(b.dailyGoalXp)));
  if (typeof b.maxIntervalDays === 'number') s.maxIntervalDays = Math.max(7, Math.min(36500, Math.round(b.maxIntervalDays)));
  if (typeof b.sound === 'boolean') s.sound = b.sound;
  if (typeof b.soundVolume === 'number' && Number.isFinite(b.soundVolume)) s.soundVolume = Math.max(0, Math.min(1, b.soundVolume));
  if (typeof b.thinking === 'boolean') s.thinking = b.thinking;
  save();
  res.json(s);
});

// ---------- stats ----------

app.get('/api/stats', (req, res) => {
  const day = dayOf(req);
  const p = db.profile;
  const active = db.cards.filter((c) => !c.suspended);

  const forecast: { day: string; count: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const d = addDays(day, i);
    const end = new Date(`${addDays(d, 1)}T00:00:00`).getTime();
    const start = i === 0 ? -Infinity : new Date(`${d}T00:00:00`).getTime();
    forecast.push({
      day: d,
      count: active.filter((c) => {
        if (c.srs.state === 0) return false;
        const t = new Date(c.srs.due).getTime();
        return t >= start && t < end;
      }).length,
    });
  }

  const since = addDays(day, -29);
  const recent = db.reviews.filter((r) => r.day >= since && r.rating > 0 && !r.wasNew);
  const retention = recent.length ? recent.filter((r) => r.rating > 1).length / recent.length : null;

  const tiers = [0, 0, 0, 0, 0];
  for (const c of active) tiers[masteryTier(c.srs)]++;

  const reviewsPerDay: Record<string, number> = {};
  for (const r of db.reviews) reviewsPerDay[r.day] = (reviewsPerDay[r.day] ?? 0) + 1;

  const weekXp = (offset: number) => {
    let sum = 0;
    for (let i = 0; i < 7; i++) sum += p.dailyXp[addDays(day, -i - offset)] ?? 0;
    return sum;
  };

  res.json({
    forecast,
    retention,
    reviewedLast30: recent.length,
    tiers,
    dailyXp: p.dailyXp,
    reviewsPerDay,
    thisWeekXp: weekXp(0),
    lastWeekXp: weekXp(7),
    totalReviews: db.reviews.length,
    totalCards: db.cards.length,
    stats: p.stats,
    achievements: ACHIEVEMENTS.map((a) => ({ id: a.id, icon: a.icon, name: a.name, desc: a.desc, unlockedAt: p.achievements[a.id] ?? null })),
  });
});

// ---------- backup ----------

app.get('/api/export', (_req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="flick-backup-${localDay()}.json"`);
  res.json(db);
});

app.post(
  '/api/import',
  wrap((req, res) => {
    const data = req.body as Data;
    if (!data || data.version !== 1 || !Array.isArray(data.decks) || !Array.isArray(data.cards) || !data.profile) {
      throw new HttpError(400, 'That does not look like a Flick backup');
    }
    replaceAll(data);
    res.json({ ok: true });
  }),
);

// ---------- static & errors ----------

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(here, '..', 'dist');
const serveUi = fs.existsSync(path.join(dist, 'index.html'));
if (serveUi) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
  } else if (err instanceof ClaudeError) {
    res.status(502).json({ error: err.message, hint: err.hint });
  } else {
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Server error' });
  }
});

const port = Number(process.env.FLICK_PORT ?? 4317);
// Bound to localhost only: the server can run Claude Code on your behalf.
app.listen(port, '127.0.0.1', () => {
  console.log(`\n  ⚡ Flick API on http://localhost:${port}  (data: ${DATA_DIR})`);
  if (serveUi) console.log(`  Open http://localhost:${port} to study.\n`);
});
