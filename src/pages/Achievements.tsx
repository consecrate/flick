import { ACHIEVEMENTS } from '../../shared/game.ts';
import { useAppState } from '../app-context.tsx';
import { Icon } from '../components/icons.tsx';
import { ProgressBar } from '../components/ui.tsx';

export function Achievements() {
  const s = useAppState();
  const unlocked = s.profile.achievements;
  const count = Object.keys(unlocked).length;
  return (
    <div className="page">
      <h1>Trophies</h1>
      <p className="muted">
        {count} of {ACHIEVEMENTS.length} unlocked
      </p>
      <ProgressBar value={count} max={ACHIEVEMENTS.length} height={4} />
      <div className="trophy-grid">
        {ACHIEVEMENTS.map((a) => {
          const at = unlocked[a.id];
          return (
            <div key={a.id} className={`trophy ${at ? 'unlocked' : 'locked'}`}>
              <div className="trophy-icon">{at ? a.icon : <Icon name="lock" size={18} />}</div>
              <div className="trophy-name">{a.name}</div>
              <div className="muted small">{a.desc}</div>
              {at && <div className="muted small">{new Date(at).toLocaleDateString()}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
