import { SHOP, type ShopItem } from '../../shared/game.ts';
import { api } from '../api.ts';
import { useApp, useAppState } from '../app-context.tsx';
import { confetti } from '../fx.ts';
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
      toast({ icon: item.icon, title: `Bought ${item.name}`, kind: 'success' });
      announceAchievements(r.newAchievements);
      await refresh();
    } catch (e) {
      showError(e);
    }
  };

  const equip = async (item: ShopItem) => {
    try {
      if (item.kind === 'theme') await api.updateProfile({ theme: item.id });
      else await api.updateProfile({ avatar: String(item.value) });
      sfx.click();
      await refresh();
    } catch (e) {
      showError(e);
    }
  };

  const owns = (item: ShopItem) => item.price === 0 || p.owned.includes(item.id);
  const equipped = (item: ShopItem) => (item.kind === 'theme' ? p.theme === item.id : p.avatar === item.value);

  const section = (title: string, kinds: ShopItem['kind'][], note?: string) => (
    <section>
      <div className="section-head">
        <h2>{title}</h2>
        {note && <span className="muted small">{note}</span>}
      </div>
      <div className="shop-grid">
        {SHOP.filter((i) => kinds.includes(i.kind)).map((item) => {
          const consumable = item.kind === 'consumable' || item.kind === 'boost';
          const own = !consumable && owns(item);
          const maxed = item.id === 'freeze' && p.streak.freezes >= (item.max ?? 3);
          return (
            <div key={item.id} className={`shop-item ${equipped(item) && !consumable ? 'equipped' : ''}`}>
              {item.kind === 'theme' ? (
                <div className="swatch">
                  {(item.value as string[]).map((c) => (
                    <span key={c} style={{ background: c }} />
                  ))}
                </div>
              ) : (
                <div className="shop-icon">{item.icon}</div>
              )}
              <div className="shop-name">{item.name}</div>
              <div className="muted small">{item.desc}</div>
              {item.id === 'freeze' && <div className="muted small">You have {p.streak.freezes}/3</div>}
              {consumable ? (
                <button className="btn primary small" disabled={p.coins < item.price || maxed} onClick={() => void buy(item)}>
                  {maxed ? 'Maxed' : `🪙 ${item.price}`}
                </button>
              ) : own ? (
                <button className="btn small" disabled={equipped(item)} onClick={() => void equip(item)}>
                  {equipped(item) ? 'Equipped' : 'Equip'}
                </button>
              ) : (
                <button className="btn primary small" disabled={p.coins < item.price} onClick={() => void buy(item)}>
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
        <h1>Shop</h1>
        <span className="coin-balance">🪙 {p.coins}</span>
      </div>
      <p className="muted">Earn coins from XP (1 per 10 XP), daily quests and chests. Everything here is cosmetic or a study helper. Your learning is never paywalled.</p>
      {section('Power-ups', ['consumable', 'boost'])}
      {section('Themes', ['theme'])}
      {section('Avatars', ['avatar'], 'The ⚡ avatar is free; equip it in Settings.')}
    </div>
  );
}
