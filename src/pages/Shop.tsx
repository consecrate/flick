import { SHOP, ownsItem, type ShopItem } from '../../shared/game.ts';
import { api } from '../api.ts';
import { useApp, useAppState } from '../app-context.tsx';
import { Mascot } from '../components/Mascot.tsx';
import { Page, SectionHead } from '../components/shared.tsx';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
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

  const art = (locked: boolean) => cn(locked && 'opacity-45 grayscale');
  const section = (title: string, kinds: ShopItem['kind'][], note?: string, keep: (i: ShopItem) => boolean = () => true) => (
    <section>
      <SectionHead title={title}>{note && <span className="text-sm text-muted-foreground">{note}</span>}</SectionHead>
      <div className="stagger grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
        {SHOP.filter((i) => kinds.includes(i.kind) && keep(i))
          // Owned and buyable first, then level-locked items by level.
          .sort((a, b) => (levelLocked(a) ? a.unlockLevel! : 0) - (levelLocked(b) ? b.unlockLevel! : 0))
          .map((item) => {
            const consumable = item.kind === 'consumable' || item.kind === 'boost';
            const own = !consumable && owns(item);
            const locked = !own && levelLocked(item);
            const maxed = item.id === 'freeze' && p.streak.freezes >= (item.max ?? 3);
            const on = equipped(item) && !consumable;
            return (
              <Card
                key={item.id}
                className={cn('items-center gap-1 px-4 pt-6 pb-4 text-center text-sm', on && 'border-primary shadow-[0_3px_0_var(--accent-soft-strong)]', locked && 'text-muted-foreground')}
              >
                {item.kind === 'theme' ? (
                  <div className={cn('mb-2 flex h-14 w-full overflow-hidden rounded-md border-2 border-border', art(locked))}>
                    {(item.value as string[]).map((c, i) => (
                      <span key={c} className="flex-1 last:flex-[0_0_25%]" style={{ background: i === 0 ? `${patternImage(item.pattern, (item.value as string[])[2])} ${c}` : c }} />
                    ))}
                  </div>
                ) : item.kind === 'skin' ? (
                  <div className={cn('mb-2 grid h-32 w-full place-items-center rounded-md bg-muted', locked && '[&_.mascot]:opacity-85')}>
                    <Mascot skin={item.id} hat={null} size={84} />
                  </div>
                ) : item.kind === 'hat' ? (
                  <div className={cn('mb-2 grid size-16 place-items-center rounded-full bg-muted [&_.mascot]:-mt-3.5', art(locked))}>
                    <Mascot hat={item.id} size={64} />
                  </div>
                ) : (
                  <div className={cn('mb-2 grid size-16 place-items-center rounded-full bg-muted text-[34px]', art(locked))}>{item.icon}</div>
                )}
                <div className={cn('font-display text-md font-semibold', !locked && 'text-foreground')}>{item.name}</div>
                <div className="flex-1 text-muted-foreground">{item.desc}</div>
                {item.id === 'freeze' && <div className="text-muted-foreground">You have {p.streak.freezes}/3</div>}
                <div className="mt-2 w-full">
                  {consumable ? (
                    <Button size="sm" variant="default" className="w-full" disabled={p.coins < item.price || maxed} onClick={() => void buy(item)}>
                      {maxed ? 'Maxed' : <>🪙 {item.price}</>}
                    </Button>
                  ) : own ? (
                    <Button size="sm" variant="ghost" className="w-full" disabled={equipped(item) && !removable(item)} onClick={() => void equip(item)}>
                      {equipped(item) ? (removable(item) ? 'Take off' : 'Equipped') : removable(item) ? 'Wear' : 'Equip'}
                    </Button>
                  ) : locked ? (
                    <Tip label={item.price === 0 ? 'Free when you reach this level' : 'Goes on sale at this level'}>
                      <span className="block">
                        <Button size="sm" className="w-full" disabled>
                          🔒 Level {item.unlockLevel}
                          {item.price > 0 && <> · 🪙 {item.price}</>}
                        </Button>
                      </span>
                    </Tip>
                  ) : (
                    <Button size="sm" className="w-full" disabled={p.coins < item.price} onClick={() => void buy(item)}>
                      🪙 {item.price}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
      </div>
    </section>
  );

  return (
    <Page>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1>Shop 🛍️</h1>
          <span
            className="inline-flex h-11 items-center gap-1.5 rounded-full border-2 border-border bg-card pr-6 pl-4 font-display text-lg font-bold"
            title="Your coins"
          >
            🪙 {p.coins}
          </span>
        </div>
        <p className="text-muted-foreground">Earn coins from XP (1 per 10 XP), daily quests and chests. Everything here is cosmetic or a study helper. Your learning is never paywalled.</p>
      </div>
      {section('Power-ups', ['consumable', 'boost'])}
      {section('Skins for Flicky', ['skin'], 'The rarest things in Flick. Save up!')}
      {section('Hats for Flicky', ['hat'], 'Level rewards are free; see them all on your Journey.')}
      {section('Premium themes', ['theme'], 'Each with its own background pattern.', (i) => !!i.pattern)}
      {section('Themes', ['theme'], undefined, (i) => !i.pattern)}
      {section('Avatars', ['avatar'], 'The default avatar is free; equip it in Settings.')}
    </Page>
  );
}
