import { useEffect, useRef, useState } from 'react';
import { SHOP } from '../../shared/game.ts';
import type { Settings as SettingsT } from '../../shared/types.ts';
import { api } from '../api.ts';
import { useApp, useAppState } from '../app-context.tsx';
import { Spinner } from '../components/ui.tsx';

export function Settings() {
  const s = useAppState();
  const { refresh, showError, toast } = useApp();
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
      toast({ icon: '✅', title: 'Claude is connected', body: `${r.message} (${(r.durationMs / 1000).toFixed(1)}s)`, kind: 'success' });
    } catch (e) {
      showError(e);
    } finally {
      setTesting(false);
    }
  };

  const restore = async (file: File) => {
    if (!confirm('Replace ALL your Flick data with this backup? This cannot be undone.')) return;
    try {
      await api.importBackup(JSON.parse(await file.text()));
      await refresh();
      toast({ icon: '📦', title: 'Backup restored', kind: 'success' });
    } catch (e) {
      showError(e);
    }
  };

  const st = s.settings;
  const ownedAvatars = ['⚡', ...s.profile.owned.filter((id) => id.startsWith('avatar-')).map((id) => avatarOf(id))];

  return (
    <div className="page narrow">
      <h1>Settings</h1>

      <div className="panel">
        <h3>Profile</h3>
        <label className="field">
          <span>Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && void api.updateProfile({ name }).then(refresh)} />
        </label>
        <div className="field">
          <span>Avatar</span>
          <div className="avatar-row">
            {ownedAvatars.map((a) => (
              <button key={a} className={`avatar-pick ${s.profile.avatar === a ? 'active' : ''}`} onClick={() => void api.updateProfile({ avatar: a }).then(refresh).catch(showError)}>
                {a}
              </button>
            ))}
            <a className="small" href="#/shop">
              More in the shop →
            </a>
          </div>
        </div>
      </div>

      <div className="panel">
        <h3>Claude</h3>
        <p className="muted small">
          Flick runs the <code>claude</code> CLI on this computer, so AI features use the account you are logged into in Claude Code (your Pro/Max
          subscription). No API key needed.
        </p>
        <p className="small">
          CLI: {health ? health.claude ? <code>{health.claude}</code> : <span className="bad-text">not found. Install Claude Code and run `claude` once to log in.</span> : <Spinner />}
        </p>
        <label className="field">
          <span>Model for writing cards & tutoring</span>
          <select className="input" value={st.model} onChange={(e) => void set({ model: e.target.value as SettingsT['model'] })}>
            <option value="haiku">Haiku: fastest, lightest on usage limits</option>
            <option value="sonnet">Sonnet: balanced (recommended)</option>
            <option value="opus">Opus: best quality, uses the most of your limits</option>
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={st.thinking} onChange={(e) => void set({ thinking: e.target.checked })} />
          <span>Let Claude think before writing cards (about 3× slower, sometimes better cards)</span>
        </label>
        <p className="muted small">Answer appeals always use Haiku so they come back in a few seconds.</p>
        <button className="btn" disabled={testing} onClick={() => void test()}>
          {testing ? <Spinner /> : '🔌'} Test connection
        </button>
      </div>

      <div className="panel">
        <h3>Spaced repetition (FSRS)</h3>
        <label className="field">
          <span>
            Desired retention: <b>{Math.round(st.desiredRetention * 100)}%</b>
          </span>
          <input type="range" min={0.75} max={0.97} step={0.01} value={st.desiredRetention} onChange={(e) => void set({ desiredRetention: +e.target.value })} />
          <span className="muted small">Higher means more frequent reviews. 90% is the usual sweet spot between effort and memory.</span>
        </label>
        <label className="field">
          <span>New cards per day</span>
          <input className="input" type="number" min={0} max={500} value={st.newPerDay} onChange={(e) => void set({ newPerDay: +e.target.value })} />
        </label>
        <label className="field">
          <span>Questions per quiz session</span>
          <input className="input" type="number" min={4} max={50} value={st.sessionSize} onChange={(e) => void set({ sessionSize: +e.target.value })} />
        </label>
        <label className="field">
          <span>Maximum interval (days)</span>
          <input className="input" type="number" min={7} max={36500} value={st.maxIntervalDays} onChange={(e) => void set({ maxIntervalDays: +e.target.value })} />
        </label>
      </div>

      <div className="panel">
        <h3>Game</h3>
        <label className="field">
          <span>Daily XP goal</span>
          <select className="input" value={st.dailyGoalXp} onChange={(e) => void set({ dailyGoalXp: +e.target.value })}>
            {[50, 100, 150, 250, 400, 600].map((g) => (
              <option key={g} value={g}>
                {g} XP {g <= 50 ? '(casual)' : g <= 150 ? '(regular)' : g <= 250 ? '(serious)' : '(intense)'}
              </option>
            ))}
          </select>
        </label>
        <label className="check">
          <input type="checkbox" checked={st.sound} onChange={(e) => void set({ sound: e.target.checked })} />
          <span>Sound effects</span>
        </label>
      </div>

      <div className="panel">
        <h3>Data</h3>
        <p className="muted small">
          Everything is stored on this computer in <code>{health?.dataDir ?? '…'}</code>.
        </p>
        <div className="row">
          <a className="btn" href="/api/export" download>
            ⬇ Export backup
          </a>
          <button className="btn" onClick={() => fileRef.current?.click()}>
            ⬆ Restore backup
          </button>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => e.target.files?.[0] && void restore(e.target.files[0])} />
        </div>
      </div>
    </div>
  );
}

function avatarOf(id: string): string {
  return String(SHOP.find((i) => i.id === id)?.value ?? '⚡');
}
