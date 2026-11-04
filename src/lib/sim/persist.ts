import type { Coin, Market, Position, UserTrade, WalletKind } from "./market";

/**
 * Saving the whole market would not fit in browser storage, so a save holds your
 * wallet + history and only the coins you still hold. On load those coins are put
 * back into a fresh market, shifted onto its clock. They pause while you're away.
 */
export interface SavedCoin extends Omit<Coin, "holders" | "kinds" | "holderList" | "holderIdx"> {
  holders: [string, number][];
  kinds: [string, WalletKind][];
}

export interface MarketSave {
  time: number;
  sol: number;
  startSol: number;
  nextId: number;
  positions: Position[];
  history: UserTrade[];
  coins: SavedCoin[];
}

const MAX_HISTORY = 1000;

export function snapshot(m: Market): MarketSave {
  // Orders still in flight are cancelled: refund the SOL held for buys.
  const pendingBuys = m.pending.filter((o) => o.side === "buy").reduce((s, o) => s + o.amount, 0);
  const coins: SavedCoin[] = [];
  for (const p of m.positions.values()) {
    const c = m.coins.get(p.coinId);
    if (!c || p.tokens <= 0) continue;
    const { holders, kinds, holderList: _l, holderIdx: _i, ...rest } = c;
    void _l;
    void _i;
    coins.push({ ...rest, holders: [...holders], kinds: [...kinds] });
  }
  return {
    time: m.time,
    sol: m.sol + pendingBuys,
    startSol: m.startSol,
    nextId: m.nextId,
    positions: [...m.positions.values()],
    history: m.history.slice(-MAX_HISTORY),
    coins,
  };
}

/** Load a save into a (fresh, warmed-up) market. */
export function restore(m: Market, s: MarketSave): void {
  // Whole minutes, so 1s and 1m candle buckets stay aligned.
  const shift = Math.floor((m.time - s.time) / 60_000) * 60_000;
  const sec = shift / 1000;
  for (const sc of s.coins) {
    const c: Coin = {
      ...sc,
      createdAt: sc.createdAt + shift,
      lastTradeAt: sc.lastTradeAt + shift,
      graduatedAt: sc.graduatedAt === undefined ? undefined : sc.graduatedAt + shift,
      trades: sc.trades.map((t) => ({ ...t, t: t.t + shift })),
      candles: sc.candles.map((k) => ({ ...k, t: k.t + sec })),
      candles1m: sc.candles1m.map((k) => ({ ...k, t: k.t + sec })),
      scheduled: sc.scheduled.map((a) => ({ ...a, at: a.at + shift })),
      holders: new Map(sc.holders),
      kinds: new Map(sc.kinds),
      holderList: sc.holders.map(([w]) => w),
      holderIdx: new Map(sc.holders.map(([w], i) => [w, i])),
    };
    m.coins.set(c.id, c);
  }
  m.sol = s.sol;
  m.startSol = s.startSol;
  m.nextId = Math.max(m.nextId, s.nextId);
  m.positions = new Map(s.positions.map((p) => [p.coinId, p]));
  m.history = s.history.map((h) => ({ ...h, t: h.t + shift }));
}
