import { SHOP, ownsItem, type ShopItem } from '../../shared/game.ts';
import { api } from '../api.ts';
import { useApp, useAppState } from '../app-context.tsx';
import { Mascot } from '../components/Mascot.tsx';
import { confetti } from '../fx.ts';
import { patternImage } from '../theme-patterns.ts';
import { sfx } from '../sound.ts';

export function Shop() {
  const s = useAppState();
  const { refresh, showError, toast, announceAchievements } = useApp();
  const p = s.profile;

  const buy = async (item: ShopItem) => {
    try {
      const r = await api.buy(item.id);
      sfx.coin();
      confetti(60);
      toast({ icon: item.icon, title: `Bought ${item.name}!`, kind: 'success' });
      announceAchievements(r.newAchievements);
      await refresh();
    } catch (e) {
      showError(e);
    }
  };

  const equip = async (item: ShopItem) => {
    try {
      if (item.kind === 'theme') await api.updateProfile({ theme: item.id });
      else if (item.kind === 'hat') await api.updateProfile({ hat: equipped(item) ? null : item.id });
      else if (item.kind === 'skin') await api.updateProfile({ skin: equipped(item) ? null : item.id });
      else await api.updateProfile({ avatar: String(item.value) });
      sfx.click();
      await refresh();
    } catch (e) {
      showError(e);
    }
  };

  const level = s.level.level;
  const owns = (item: ShopItem) => ownsItem(p, item, level);
  const equipped = (item: ShopItem) =>
    item.kind === 'theme' ? p.theme === item.id : item.kind === 'hat' ? p.hat === item.id : item.kind === 'skin' ? p.skin === item.id : p.avatar === item.value;
  // Hats and skins come off again; themes and avatars are swapped for another.
  const removable = (item: ShopItem) => item.kind === 'hat' || item.kind === 'skin';
  const levelLocked = (item: ShopItem) => !!item.unlockLevel && level < item.unlockLevel;

  const section = (title: string, kinds: ShopItem['kind'][], note?: string, keep: (i: ShopItem) => boolean = () => true) => (
    <section>
      <div className="section-head">
        <h2>{title}</h2>
        {note && <span className="muted small">{note}</span>}
      </div>
      <div className="shop-grid">
        {SHOP.filter((i) => kinds.includes(i.kind) && keep(i))
          // Owned and buyable first, then level-locked items by level.
          .sort((a, b) => (levelLocked(a) ? a.unlockLevel! : 0) - (levelLocked(b) ? b.unlockLevel! : 0))
          .map((item) => {
          const consumable = item.kind === 'consumable' || item.kind === 'boost';
          const own = !consumable && owns(item);
          const locked = !own && levelLocked(item);
          const maxed = item.id === 'freeze' && p.streak.freezes >= (item.max ?? 3);
          return (
            <div key={item.id} className={`shop-item ${equipped(item) && !consumable ? 'equipped' : ''} ${locked ? 'level-locked' : ''}`}>
              {item.kind === 'theme' ? (
                <div className="swatch">
                  {(item.value as string[]).map((c, i) => (
                    <span key={c} style={{ background: i === 0 ? `${patternImage(item.pattern, (item.value as string[])[2])} ${c}` : c }} />
                  ))}
                </div>
              ) : item.kind === 'skin' ? (
                <div className="shop-skin">
                  <Mascot skin={item.id} hat={null} size={84} />
                </div>
              ) : item.kind === 'hat' ? (
                <div className="shop-hat">
                  <Mascot hat={item.id} size={64} />
                </div>
              ) : (
                <div className="shop-icon">{item.icon}</div>
              )}
              <div className="shop-name">{item.name}</div>
              <div className="muted small">{item.desc}</div>
              {item.id === 'freeze' && <div className="muted small">You have {p.streak.freezes}/3</div>}
              {consumable ? (
                <button className="btn primary small" disabled={p.coins < item.price || maxed} onClick={() => void buy(item)}>
                  {maxed ? (
                    'Maxed'
                  ) : (
                    <>
                      🪙 {item.price}
                    </>
                  )}
                </button>
              ) : own ? (
                <button className="btn ghost small" disabled={equipped(item) && !removable(item)} onClick={() => void equip(item)}>
                  {equipped(item) ? (removable(item) ? 'Take off' : 'Equipped') : removable(item) ? 'Wear' : 'Equip'}
                </button>
              ) : locked ? (
                <button className="btn small" disabled title={item.price === 0 ? 'Free when you reach this level' : 'Goes on sale at this level'}>
                  🔒 Level {item.unlockLevel}
                  {item.price > 0 && <> · 🪙 {item.price}</>}
                </button>
              ) : (
                <button className="btn small" disabled={p.coins < item.price} onClick={() => void buy(item)}>
                  🪙 {item.price}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );

  return (
    <div className="page">
      <div className="section-head">
        <h1>Shop 🛍️</h1>
        <span className="coin-balance" title="Your coins">
          🪙 {p.coins}
        </span>
      </div>
      <p className="muted">Earn coins from XP (1 per 10 XP), daily quests and chests. Everything here is cosmetic or a study helper. Your learning is never paywalled.</p>
      {section('Power-ups', ['consumable', 'boost'])}
      {section('Skins for Flicky', ['skin'], 'The rarest things in Flick. Save up!')}
      {section('Hats for Flicky', ['hat'], 'Level rewards are free; see them all on your Journey.')}
      {section('Premium themes', ['theme'], 'Each with its own background pattern.', (i) => !!i.pattern)}
      {section('Themes', ['theme'], undefined, (i) => !i.pattern)}
      {section('Avatars', ['avatar'], 'The default avatar is free; equip it in Settings.')}
    </div>
  );
}
