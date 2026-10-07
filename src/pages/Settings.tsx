import { useEffect, useRef, useState } from 'react';
import { SHOP, ownsItem } from '../../shared/game.ts';
import { MODEL_PRESETS, isValidModel, type ModelChoice, type Settings as SettingsT } from '../../shared/types.ts';
import { api } from '../api.ts';
import { useApp, useAppState } from '../app-context.tsx';
import { Page, Spinner } from '../components/shared.tsx';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { setSoundEnabled, setSoundVolume, sfx } from '../sound.ts';

export function Settings() {
  const s = useAppState();
  const { refresh, showError, toast, ask } = useApp();
  const [health, setHealth] = useState<{ claude: string | null; dataDir: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [name, setName] = useState(s.profile.name);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.health().then(setHealth).catch(showError);
  }, [showError]);

  const set = async (patch: Partial<SettingsT>) => {
    try {
      await api.updateSettings(patch);
      await refresh();
    } catch (e) {
      showError(e);
    }
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await api.testClaude();
      const used = r.models.length ? ` via ${r.models.join(', ')}` : '';
      toast({ title: 'Claude is connected', body: `${r.message} (${(r.durationMs / 1000).toFixed(1)}s${used})`, kind: 'success' });
    } catch (e) {
      showError(e);
    } finally {
      setTesting(false);
    }
  };

  const restore = async (file: File) => {
    const ok = await ask({
      title: 'Restore this backup?',
      description: 'It replaces all your Flick data: decks, cards, progress and purchases. This cannot be undone.',
      actions: [{ label: 'Replace my data', value: 'ok', destructive: true }],
    });
    if (fileRef.current) fileRef.current.value = '';
    if (ok !== 'ok') return;
    try {
      await api.importBackup(JSON.parse(await file.text()));
      await refresh();
      toast({ title: 'Backup restored', kind: 'success' });
    } catch (e) {
      showError(e);
    }
  };

  const st = s.settings;
  const [retention, setRetention] = useState(st.desiredRetention);
  const [volume, setVolume] = useState(st.soundVolume);
  useEffect(() => setRetention(st.desiredRetention), [st.desiredRetention]);
  useEffect(() => setVolume(st.soundVolume), [st.soundVolume]);
  const ownedAvatars = ['⚡', ...SHOP.filter((i) => i.kind === 'avatar' && ownsItem(s.profile, i, s.level.level)).map((i) => String(i.value))];

  return (
    <Page narrow>
      <h1>Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="profile-name">Name</FieldLabel>
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && void api.updateProfile({ name }).then(refresh)} />
          </Field>
          <Field>
            <FieldLabel asChild>
              <span>Avatar</span>
            </FieldLabel>
            <div className="flex flex-wrap items-center gap-2">
              {ownedAvatars.map((a) => (
                <button
                  key={a}
                  aria-pressed={s.profile.avatar === a}
                  className={cn(
                    'grid size-12 place-items-center rounded-md border-2 border-border bg-card text-[24px] transition-colors hover:bg-accent',
                    s.profile.avatar === a && 'border-primary bg-brand-soft',
                  )}
                  onClick={() => void api.updateProfile({ avatar: a }).then(refresh).catch(showError)}
                >
                  {a}
                </button>
              ))}
              <Button variant="link" size="sm" asChild>
                <a href="#/shop">More in the shop →</a>
              </Button>
            </div>
          </Field>
        </FieldGroup>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Claude</CardTitle>
          <CardDescription>
            Flick runs the <code>claude</code> CLI on this computer, so AI features use the account you are logged into in Claude Code (your Pro/Max
            subscription). No API key needed.
          </CardDescription>
        </CardHeader>
        <p className="text-sm">
          CLI:{' '}
          {health ? (
            health.claude ? (
              <code className="font-mono">{health.claude}</code>
            ) : (
              <span className="text-destructive">not found. Install Claude Code and run `claude` once to log in.</span>
            )
          ) : (
            <Spinner />
          )}
        </p>
        <FieldGroup>
          <ModelPicker id="model-cards" label="Model for writing cards & tutoring" value={st.model} onChange={(model) => void set({ model })} />
          <ModelPicker id="model-grading" label="Model for checking typed answers & appeals" value={st.gradingModel} onChange={(gradingModel) => void set({ gradingModel })} />
          <FieldDescription>
            Pick a preset or enter any model name Claude Code accepts with <code>--model</code>, such as a full ID like <code>claude-sonnet-5-5</code>. A fast
            model keeps answer checks to a few seconds.
          </FieldDescription>
          <Field orientation="horizontal">
            <Switch id="thinking" checked={st.thinking} onCheckedChange={(thinking) => void set({ thinking })} />
            <FieldLabel htmlFor="thinking" className="font-normal">
              Let Claude think before writing cards (about 3× slower, sometimes better cards)
            </FieldLabel>
          </Field>
        </FieldGroup>
        <div>
          <Button disabled={testing} onClick={() => void test()}>
            {testing && <Spinner />} Test connection
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Spaced repetition (FSRS)</CardTitle>
        </CardHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="retention">
              Desired retention: <b className="num">{Math.round(retention * 100)}%</b>
            </FieldLabel>
            <Slider
              id="retention"
              min={0.75}
              max={0.97}
              step={0.01}
              value={[retention]}
              onValueChange={([v]) => setRetention(v)}
              onValueCommit={([v]) => void set({ desiredRetention: v })}
            />
            <FieldDescription>Higher means more frequent reviews. 90% is the usual balance between effort and memory.</FieldDescription>
          </Field>
          <NumberField id="new-per-day" label="New cards per day" min={0} max={500} value={st.newPerDay} onChange={(newPerDay) => void set({ newPerDay })} />
          <NumberField id="session-size" label="Questions per quiz session" min={4} max={50} value={st.sessionSize} onChange={(sessionSize) => void set({ sessionSize })} />
          <NumberField
            id="max-interval"
            label="Maximum interval (days)"
            min={7}
            max={36500}
            value={st.maxIntervalDays}
            onChange={(maxIntervalDays) => void set({ maxIntervalDays })}
          />
        </FieldGroup>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Game</CardTitle>
        </CardHeader>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="goal">Daily XP goal</FieldLabel>
            <Select value={String(st.dailyGoalXp)} onValueChange={(v) => void set({ dailyGoalXp: +v })}>
              <SelectTrigger id="goal" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[50, 100, 150, 250, 400, 600].map((g) => (
                  <SelectItem key={g} value={String(g)}>
                    {g} XP {g <= 50 ? '(casual)' : g <= 150 ? '(regular)' : g <= 250 ? '(serious)' : '(intense)'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field orientation="horizontal">
            <Switch
              id="sound"
              checked={st.sound}
              onCheckedChange={(on) => {
                setSoundEnabled(on);
                void set({ sound: on });
              }}
            />
            <FieldLabel htmlFor="sound" className="font-normal">
              Sound effects
            </FieldLabel>
          </Field>
          {st.sound && (
            <Field>
              <FieldLabel htmlFor="volume">
                Volume: <b className="num">{Math.round(volume * 100)}%</b>
              </FieldLabel>
              <Slider
                id="volume"
                min={0}
                max={1}
                step={0.05}
                value={[volume]}
                onValueChange={([v]) => {
                  setVolume(v);
                  setSoundVolume(v);
                }}
                onValueCommit={([v]) => {
                  sfx.correct(0);
                  void set({ soundVolume: v });
                }}
              />
            </Field>
          )}
        </FieldGroup>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data</CardTitle>
          <CardDescription>
            Everything is stored on this computer in <code>{health?.dataDir ?? '…'}</code>.
          </CardDescription>
        </CardHeader>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href="/api/export" download>
              Export backup
            </a>
          </Button>
          <Button onClick={() => fileRef.current?.click()}>Restore backup</Button>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && void restore(e.target.files[0])} />
        </div>
      </Card>
    </Page>
  );
}

/** A number input that saves on blur or Enter, so typing "120" does not save 1 and 12 on the way. */
function NumberField({ id, label, min, max, value, onChange }: { id: string; label: string; min: number; max: number; value: number; onChange: (n: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Math.round(+draft);
    if (!Number.isFinite(n) || draft.trim() === '') return setDraft(String(value));
    const clamped = Math.min(max, Math.max(min, n));
    setDraft(String(clamped));
    if (clamped !== value) onChange(clamped);
  };
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className="num max-w-40"
      />
    </Field>
  );
}

const CUSTOM = '__custom';

function ModelPicker({ id, label, value, onChange }: { id: string; label: string; value: ModelChoice; onChange: (m: ModelChoice) => void }) {
  const isPreset = MODEL_PRESETS.some((p) => p.value === value);
  const [custom, setCustom] = useState(!isPreset);
  const [draft, setDraft] = useState(isPreset ? '' : value);
  const trimmed = draft.trim();
  const valid = isValidModel(trimmed);

  const commit = () => {
    if (valid && trimmed !== value) onChange(trimmed);
  };

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select
        value={custom ? CUSTOM : value}
        onValueChange={(v) => {
          if (v === CUSTOM) {
            setCustom(true);
          } else {
            setCustom(false);
            onChange(v);
          }
        }}
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MODEL_PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM}>Custom model ID…</SelectItem>
        </SelectContent>
      </Select>
      {custom && (
        <div className="flex gap-2">
          <Input placeholder="e.g. claude-sonnet-5-5" value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && commit()} />
          <Button type="button" disabled={!valid || trimmed === value} onClick={commit}>
            Use
          </Button>
        </div>
      )}
      {custom && trimmed && !valid && <p className="text-sm text-destructive">Use only letters, digits, dots, dashes and underscores.</p>}
    </Field>
  );
}
