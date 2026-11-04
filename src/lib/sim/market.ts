import {
  applyBuy, applySell, graduate, mcapUsd, newReserves, quoteBuy, quoteSell, shouldGraduate,
  type Reserves,
} from "./curve";
import { address, coinName, META_THEMES, themesOf } from "./names";
import { activity, makePlan, playerArchetype, targetMcap, type Plan } from "./plan";
import { Rng } from "./rng";

export type Side = "buy" | "sell";
/** "insider" = a rug's hidden wallets: they look like normal traders to you. */
export type WalletKind = "dev" | "bundle" | "insider" | "sniper" | "kol" | "trader" | "you";

export interface Trade {
  t: number; // sim ms
  side: Side;
  sol: number;
  tokens: number;
  wallet: string;
  kind: WalletKind;
  mcapUsd: number;
}

/** 1-second candle of market cap in USD. */
export interface Candle {
  t: number; // sim seconds
  o: number;
  h: number;
  l: number;
  c: number;
  v: number; // SOL volume
}

interface Action {
  at: number; // sim ms
  wallet: string;
  buySol?: number;
  sellFrac?: number;
}

export interface Coin {
  id: string;
  name: string;
  ticker: string;
  hue: number;
  createdAt: number;
  dev: string;
  plan: Plan;
  startMcap: number;
  r: Reserves;
  holders: Map<string, number>;
  holderList: string[]; // for O(1) random picks
  holderIdx: Map<string, number>;
  kinds: Map<string, WalletKind>;
  trades: Trade[]; // newest last
  candles: Candle[]; // 1s
  candles1m: Candle[];
  athMcap: number;
  volumeSol: number;
  buys: number;
  sells: number;
  noise: number;
  lastTradeAt: number;
  graduatedAt?: number;
  devSold: boolean;
  mine?: boolean; // you launched it (you are the dev)
  ruggedAt?: number; // sim ms when you rugged your own coin
  boost: number; // social hype, in log-mcap units; fades over a couple of minutes
  hypedAt?: number; // sim ms of the last post that moved it
  hypedBy?: string; // who posted (account handle, or "you")
  themes: string[]; // metas this coin belongs to (e.g. "Cat")
  devProfile?: DevProfile; // the creator's track record (shared across their coins)
  rugCounted?: boolean;
  shared?: { uuid: string; creator: string }; // a player's public coin, settled by the server
  dead: boolean;
  scheduled: Action[];
}

export interface Position {
  coinId: string;
  ticker: string;
  tokens: number;
  costSol: number; // SOL cost basis of the tokens still held (fees included)
  realizedSol: number;
  boughtSol: number;
  soldSol: number;
}

export interface UserTrade {
  id: number;
  t: number;
  coinId: string;
  ticker: string;
  side: Side;
  status: "ok" | "failed";
  reason?: string;
  sol: number; // SOL spent (buy) or received (sell), excluding priority fee
  tokens: number;
  mcapUsd: number;
  fee: number;
  priorityFee: number;
  // Sells only: profit on the part sold (after all fees) vs. what it cost you.
  pnlSol?: number;
  pnlPct?: number;
  soldPct?: number; // share of the bag this sell was
  // Set when this sell closed the position: result of the whole trade.
  positionPnlSol?: number;
  positionPnlPct?: number;
  note?: "launch" | "rug";
  bot?: string; // placed by one of your bots
}

/**
 * Devs launch many coins. Their hidden type decides what they launch; their public
 * record (coins, rugs, migrations) is what a careful trader checks.
 */
export interface DevProfile {
  id: string;
  type: "rugger" | "spammer" | "builder";
  created: number;
  rugged: number;
  migrated: number;
}

/** A narrative the market is obsessed with for a few minutes. */
export interface Meta {
  word: string;
  startedAt: number; // sim ms
  until: number;
}

/** A shared coin as the server reports it, with times already converted to sim ms. */
export interface SharedState {
  uuid: string;
  creator: string;
  name: string;
  ticker: string;
  hue: number;
  socials: { x: boolean; tg: boolean; web: boolean };
  createdAt: number;
  phase: "curve" | "graduated";
  rSol: number;
  rTok: number;
  tokensSold: number;
  realSol: number;
  ruggedAt?: number;
  athMcapUsd: number;
  volumeSol: number;
  buys: number;
  sells: number;
  lastTradeAt: number;
}

/** pump.fun charges a small fee to create a coin. */
export const CREATE_FEE_SOL = 0.02;

export interface LaunchRequest {
  name: string;
  ticker: string;
  hue: number;
  socials: { x: boolean; tg: boolean; web: boolean };
  devBuySol: number;
}

export interface OrderRequest {
  coinId: string;
  side: Side;
  amount: number; // SOL for buys, tokens for sells
  slippagePct: number;
  priorityFeeSol: number;
  tag?: string; // which bot placed it, shown on the fill
}

interface PendingOrder extends OrderRequest {
  id: number;
  executeAt: number;
  minOut: number;
}

export interface MarketOptions {
  seed?: number;
  startSol?: number;
  spawnEverySec?: number; // average
  maxCoins?: number;
}

const MAX_TRADES = 300;
const MAX_1S = 1800; // 30 min of 1s candles
const MAX_1M = 1440; // 24 h of 1m candles

function addToCandles(arr: Candle[], t: number, m: number, sol: number, max: number) {
  const last = arr[arr.length - 1];
  if (last && last.t === t) {
    if (m > last.h) last.h = m;
    if (m < last.l) last.l = m;
    last.c = m;
    last.v += sol;
    return;
  }
  const o = last ? last.c : m;
  arr.push({ t, o, h: Math.max(o, m), l: Math.min(o, m), c: m, v: sol });
  if (arr.length > max) arr.splice(0, arr.length - max);
}
const SUBSTEP_MS = 100;
/** How long social hype lingers (time constant, seconds). */
const BOOST_FADE_SEC = 35;
/** Share of post-driven buyers that are other bots (fast in, fast out). */
const FAST_BOT_SHARE = 0.5;
/** Metas: first one after a few minutes; extra demand for matching coins; share of copycat launches. */
const META_FIRST_MS = 3 * 60_000;
const META_BOOST = 0.3;
const META_COPYCAT_SHARE = 0.35;
/** Chance a new coin of each dev type comes from a dev who launched before. */
const DEV_REUSE = { rugger: 0.6, spammer: 0.5, builder: 0.15 };
/** Trading-terminal fee on your trades (like Axiom/BullX), on top of the curve/pool fee. */
export const PLATFORM_FEE = 0.01;

export class Market {
  time = 0;
  rng: Rng;
  coins = new Map<string, Coin>();
  devs = new Map<string, DevProfile>();
  private devPools: Record<DevProfile["type"], DevProfile[]> = { rugger: [], spammer: [], builder: [] };
  meta: Meta | null = null;
  private nextMetaAt = META_FIRST_MS;
  sol: number;
  startSol: number;
  positions = new Map<string, Position>();
  history: UserTrade[] = [];
  pending: PendingOrder[] = [];
  private nextSpawnAt = 0;
  nextId = 1; // order ids (persisted)
  private opts: Required<MarketOptions>;

  constructor(opts: MarketOptions = {}) {
    this.opts = { seed: Date.now(), startSol: 10, spawnEverySec: 4, maxCoins: 250, ...opts };
    this.rng = new Rng(this.opts.seed);
    this.sol = this.startSol = this.opts.startSol;
  }

  step(dtMs: number): void {
    let left = dtMs;
    while (left > 0) {
      const sub = Math.min(SUBSTEP_MS, left);
      left -= sub;
      this.time += sub;
      if (this.time >= this.nextMetaAt) this.rotateMeta();
      while (this.time >= this.nextSpawnAt) {
        this.spawn();
        this.nextSpawnAt += this.rng.range(0.25, 1.75) * this.opts.spawnEverySec * 1000;
      }
      for (const c of this.coins.values()) if (!c.dead && !c.shared) this.tickCoin(c, sub / 1000);
      this.executeOrders();
    }
    this.prune();
  }

  // ---------- coins ----------

  spawn(): Coin {
    const rng = this.rng;
    const plan = makePlan(rng);
    const copycat = this.meta && rng.chance(META_COPYCAT_SHARE);
    const { name, ticker } = coinName(rng, copycat ? this.meta!.word : undefined);
    const devProfile = this.pickDev(plan.archetype);
    const dev = devProfile.id;
    const c = this.newCoin(plan, name, ticker, rng.int(0, 359), dev);
    c.devProfile = devProfile;
    devProfile.created++;
    if (plan.devSol > 0) this.buy(c, dev, plan.devSol);
    for (let i = 0; i < plan.bundleWallets; i++) {
      const w = this.newWallet(c, plan.stealth ? "insider" : "bundle");
      this.buy(c, w, (plan.bundleSol / plan.bundleWallets) * rng.range(0.6, 1.4));
    }
    c.startMcap = mcapUsd(c.r);
    this.schedule(c);
    return c;
  }

  /**
   * A post moved this coin: followers ape in over the next seconds (front-loaded, so late
   * buyers pay more), and buy pressure stays elevated until the hype fades.
   */
  hype(coinId: string, h: { strength: number; buyers: number; avgBuySol: number; by: string }): void {
    const c = this.coins.get(coinId);
    if (!c || c.dead) return;
    c.boost += h.strength;
    if (h.strength > 0) {
      // a warning (negative hype) is not "posted about it" in the 🔥 sense
      c.hypedAt = this.time;
      c.hypedBy = h.by;
    }
    const rng = this.rng;
    for (let i = 0; i < h.buyers; i++) {
      const w = this.newWallet(c, "trader");
      const buySol = Math.max(0.01, rng.logNormal(h.avgBuySol, 0.8));
      if (rng.chance(FAST_BOT_SHARE)) {
        // other people's bots watch the same feed: in within a second, out on the followers
        const at = this.time + rng.range(150, 1200);
        c.scheduled.push({ at, wallet: w, buySol: buySol * 1.5 });
        c.scheduled.push({ at: at + rng.range(2, 15) * 1000, wallet: w, sellFrac: 1 });
      } else {
        const delaySec = Math.min(60, rng.logNormal(6, 0.8));
        c.scheduled.push({ at: this.time + 500 + delaySec * 1000, wallet: w, buySol });
      }
    }
    c.scheduled.sort((a, b) => a.at - b.at);
  }

  /** Launch your own coin: you're the dev. Creation fee + optional dev buy, atomically. */
  launch(req: LaunchRequest): { ok: true; coinId: string } | { ok: false; reason: string } {
    const name = req.name.trim();
    const ticker = req.ticker.trim().toUpperCase();
    if (!name || name.length > 32) return { ok: false, reason: "Name must be 1–32 characters" };
    if (!/^[A-Z0-9]{1,10}$/.test(ticker)) return { ok: false, reason: "Ticker must be 1–10 letters or numbers" };
    if (!(req.devBuySol >= 0)) return { ok: false, reason: "Invalid dev buy" };
    if (CREATE_FEE_SOL + req.devBuySol > this.sol) return { ok: false, reason: "Insufficient SOL" };

    const plan = makePlan(this.rng, playerArchetype(this.rng, req.socials, req.devBuySol));
    Object.assign(plan, {
      socials: req.socials, devSol: 0, bundleWallets: 0, bundleSol: 0,
      devSellAt: undefined, devSellFrac: undefined, rugAt: undefined,
    });
    const c = this.newCoin(plan, name, ticker, ((Math.round(req.hue) % 360) + 360) % 360, "you");
    c.mine = true;
    c.kinds.set("you", "dev");

    this.sol -= CREATE_FEE_SOL;
    const pos: Position = {
      coinId: c.id, ticker, tokens: 0, costSol: 0, realizedSol: -CREATE_FEE_SOL, boughtSol: 0, soldSol: 0,
    };
    let q = { tokensOut: 0, solUsed: 0, fee: 0 };
    if (req.devBuySol > 0) {
      q = this.buy(c, "you", req.devBuySol);
      this.sol -= q.solUsed;
      pos.tokens = q.tokensOut;
      pos.costSol = pos.boughtSol = q.solUsed;
    }
    this.positions.set(c.id, pos);
    c.startMcap = mcapUsd(c.r);
    this.schedule(c);
    this.history.push({
      id: this.nextId++, t: this.time, coinId: c.id, ticker, side: "buy", status: "ok", note: "launch",
      sol: q.solUsed, tokens: q.tokensOut, mcapUsd: mcapUsd(c.r), fee: q.fee + CREATE_FEE_SOL, priorityFee: 0,
    });
    return { ok: true, coinId: c.id };
  }

  private newCoin(plan: Plan, name: string, ticker: string, hue: number, dev: string, id?: string): Coin {
    const c: Coin = {
      id: id ?? address(this.rng, 32) + "pump",
      name,
      ticker,
      hue,
      createdAt: this.time,
      dev,
      plan,
      startMcap: 0,
      r: newReserves(),
      holders: new Map(),
      holderList: [],
      holderIdx: new Map(),
      kinds: new Map([[dev, "dev"]]),
      trades: [],
      candles: [],
      candles1m: [],
      athMcap: 0,
      volumeSol: 0,
      buys: 0,
      sells: 0,
      noise: 0,
      lastTradeAt: this.time,
      devSold: false,
      dead: false,
      scheduled: [],
      boost: 0,
      themes: themesOf(name, ticker),
    };
    this.coins.set(c.id, c);
    return c;
  }

  /** Queue the bots that act on a fresh coin: snipers, dev sells, the rug, KOLs. */
  private schedule(c: Coin): void {
    const { rng } = this;
    const plan = c.plan;
    const dev = c.dev;
    const at = (sec: number) => c.createdAt + sec * 1000;
    for (let i = 0; i < plan.snipers; i++) {
      const w = this.newWallet(c, "sniper");
      // real snipers land in the creation block or the next couple
      c.scheduled.push({ at: at(rng.range(0.05, 0.6)), wallet: w, buySol: rng.logNormal(0.7, 0.5) });
      c.scheduled.push({ at: at(rng.range(3, 45)), wallet: w, sellFrac: 1 });
    }
    if (plan.devSellAt !== undefined)
      c.scheduled.push({ at: at(plan.devSellAt), wallet: dev, sellFrac: plan.devSellFrac ?? 1 });
    if (plan.rugAt !== undefined) {
      c.scheduled.push({ at: at(plan.rugAt), wallet: dev, sellFrac: 1 });
      for (const [w, k] of c.kinds)
        if (k === "bundle" || k === "insider")
          c.scheduled.push({ at: at(plan.rugAt + rng.range(0, 2)), wallet: w, sellFrac: 1 });
    }
    if (plan.kolAt !== undefined) {
      const w = this.newWallet(c, "kol");
      c.scheduled.push({ at: at(plan.kolAt), wallet: w, buySol: rng.range(3, 15) });
      c.scheduled.push({ at: at(plan.kolAt + rng.range(20, 300)), wallet: w, sellFrac: 1 });
    }
    c.scheduled.sort((a, b) => a.at - b.at);
  }

  /** Serial ruggers and spam launchers keep coming back; builders mostly launch once. */
  private pickDev(archetype: Plan["archetype"]): DevProfile {
    const type: DevProfile["type"] = archetype === "rug" ? "rugger" : archetype === "dud" ? "spammer" : "builder";
    const pool = this.devPools[type];
    if (pool.length && this.rng.chance(DEV_REUSE[type])) return this.rng.pick(pool);
    const d: DevProfile = { id: address(this.rng), type, created: 0, rugged: 0, migrated: 0 };
    this.devs.set(d.id, d);
    pool.push(d);
    if (pool.length > 300) this.devs.delete(pool.shift()!.id);
    return d;
  }

  /** Start a new meta, or end the current one and pause before the next. */
  private rotateMeta() {
    const rng = this.rng;
    if (this.meta) {
      this.meta = null;
      this.nextMetaAt = this.time + rng.range(2, 5) * 60_000;
      return;
    }
    const prev = this.lastMetaWord;
    const word = rng.pick(META_THEMES.filter((t) => t !== prev));
    this.lastMetaWord = word;
    const until = this.time + rng.range(4, 8) * 60_000;
    this.meta = { word, startedAt: this.time, until };
    this.nextMetaAt = until;
  }
  private lastMetaWord = "";

  private newWallet(c: Coin, kind: WalletKind): string {
    const w = address(this.rng);
    c.kinds.set(w, kind);
    return w;
  }

  private tickCoin(c: Coin, dt: number): void {
    const rng = this.rng;
    const age = (this.time - c.createdAt) / 1000;
    const p = c.plan;

    while (c.scheduled.length && c.scheduled[0].at <= this.time) {
      const a = c.scheduled.shift()!;
      if (a.buySol) this.buy(c, a.wallet, a.buySol);
      else if (a.sellFrac) this.sell(c, a.wallet, (c.holders.get(a.wallet) ?? 0) * a.sellFrac);
    }

    // Bot devs rug on a schedule; on your own coin it's when you dump your bag.
    const rugSec = p.rugAt ?? (c.ruggedAt !== undefined ? (c.ruggedAt - c.createdAt) / 1000 : undefined);
    const rugged = rugSec !== undefined && age >= rugSec;
    if (rugged && !c.rugCounted) {
      c.rugCounted = true;
      if (c.devProfile) c.devProfile.rugged++;
    }
    // In-meta coins get extra demand: ramps in over 30s, then fades as copycats flood in.
    let meta = 0;
    if (this.meta && c.themes.includes(this.meta.word)) {
      const { startedAt, until } = this.meta;
      const rampIn = Math.min(1, (this.time - startedAt) / 30_000);
      const fade = Math.max(0, (until - this.time) / (until - startedAt));
      meta = META_BOOST * rampIn * fade;
    }
    c.noise += -0.2 * c.noise * dt + 0.18 * Math.sqrt(dt) * rng.normal();
    c.boost *= Math.exp(-dt / BOOST_FADE_SEC); // social hype fades

    const mcap = mcapUsd(c.r);
    let rate = p.baseRate * activity(p, age) * Math.min(3, Math.pow(Math.max(1, mcap / c.startMcap), 0.2));
    rate *= 1 + Math.abs(c.boost) + meta; // hype or FUD: either way more people trade it
    // After a rug: a burst of panic selling, then silence.
    if (rugged) rate = p.baseRate * 4 * Math.exp(-(age - rugSec!) / 15);

    const n = rng.poisson(rate * dt);
    for (let i = 0; i < n; i++) {
      const cur = mcapUsd(c.r);
      let pBuy = 0.15;
      if (!rugged) {
        const err = Math.log((targetMcap(p, c.startMcap, age) * Math.exp(c.noise + c.boost + meta)) / cur);
        pBuy = Math.min(0.9, Math.max(0.1, 0.5 + 0.4 * Math.tanh(1.5 * err)));
      }
      if (rng.chance(pBuy)) {
        const size = Math.max(0.01, rng.logNormal(0.2 * Math.sqrt(c.r.rSol / 30), 0.9));
        const w = this.randomBuyer(c);
        this.buy(c, w, size);
      } else {
        const w = this.randomSeller(c, !rugged && p.rugAt !== undefined);
        if (!w) continue;
        const bal = c.holders.get(w)!;
        const frac = rng.chance(0.4) ? 1 : rng.range(0.15, 0.9);
        this.sell(c, w, bal * frac);
      }
    }

    const quietFor = this.time - c.lastTradeAt;
    if ((age > p.peakAt + p.decayDur && quietFor > 60_000) || quietFor > 300_000) {
      c.dead = true;
      for (const w of c.kinds.keys()) if (!c.holders.has(w) && w !== c.dev) c.kinds.delete(w);
    }
  }

  /** New wallets get rarer as the holder count approaches what the mcap supports. */
  private randomBuyer(c: Coin): string {
    const target = 60 * Math.sqrt(mcapUsd(c.r) / 1000);
    if (c.holders.size > 3 && !this.rng.chance(Math.max(0.1, 1 - c.holders.size / target))) {
      const w = this.randomHolder(c, false, false);
      if (w && c.kinds.get(w) === "trader") return w;
    }
    return this.newWallet(c, "trader");
  }

  /** Mostly uniform over holders, sometimes weighted by size. Dev only sells on schedule. */
  private randomSeller(c: Coin, protectInsiders: boolean): string | undefined {
    return this.randomHolder(c, this.rng.chance(0.3), protectInsiders);
  }

  /** Rejection-sample a few holders; "weighted" keeps the biggest of 3 picks. */
  private randomHolder(c: Coin, weighted: boolean, protectInsiders: boolean): string | undefined {
    const list = c.holderList;
    if (!list.length) return undefined;
    let best: string | undefined;
    for (let tries = 0, got = 0; tries < 8 && got < (weighted ? 3 : 1); tries++) {
      const w = list[Math.floor(this.rng.next() * list.length)];
      const k = c.kinds.get(w);
      if (k === "you" || k === "dev" || k === "kol" || (protectInsiders && (k === "bundle" || k === "insider"))) continue;
      got++;
      if (!best || c.holders.get(w)! > c.holders.get(best)!) best = w;
    }
    return best;
  }

  private setBalance(c: Coin, w: string, bal: number) {
    const i = c.holderIdx.get(w);
    if (bal >= 1) {
      c.holders.set(w, bal);
      if (i === undefined) {
        c.holderIdx.set(w, c.holderList.length);
        c.holderList.push(w);
      }
    } else if (i !== undefined) {
      c.holders.delete(w);
      const last = c.holderList.pop()!;
      if (last !== w) {
        c.holderList[i] = last;
        c.holderIdx.set(last, i);
      }
      c.holderIdx.delete(w);
      if (c.kinds.get(w) === "trader") c.kinds.delete(w); // exited for good
    }
  }

  private buy(c: Coin, wallet: string, sol: number) {
    const q = quoteBuy(c.r, sol);
    if (q.tokensOut <= 0) return q;
    applyBuy(c.r, q);
    this.setBalance(c, wallet, (c.holders.get(wallet) ?? 0) + q.tokensOut);
    this.record(c, "buy", q.solUsed, q.tokensOut, wallet);
    if (shouldGraduate(c.r)) {
      graduate(c.r);
      c.graduatedAt = this.time;
      if (c.devProfile) c.devProfile.migrated++;
    }
    return q;
  }

  private sell(c: Coin, wallet: string, tokens: number) {
    const bal = c.holders.get(wallet) ?? 0;
    tokens = Math.min(tokens, bal);
    if (tokens <= 0) return undefined;
    const q = quoteSell(c.r, tokens);
    applySell(c.r, tokens, q);
    this.setBalance(c, wallet, bal - tokens);
    if (wallet === c.dev) c.devSold = true;
    this.record(c, "sell", q.solOut, tokens, wallet);
    return q;
  }

  private record(c: Coin, side: Side, sol: number, tokens: number, wallet: string) {
    const m = mcapUsd(c.r);
    c.trades.push({ t: this.time, side, sol, tokens, wallet, kind: c.kinds.get(wallet) ?? "trader", mcapUsd: m });
    if (c.trades.length > MAX_TRADES) c.trades.splice(0, c.trades.length - MAX_TRADES);
    c.volumeSol += sol;
    if (side === "buy") c.buys++;
    else c.sells++;
    c.lastTradeAt = this.time;
    c.athMcap = Math.max(c.athMcap, m);

    const sec = Math.floor(this.time / 1000);
    addToCandles(c.candles, sec, m, sol, MAX_1S);
    addToCandles(c.candles1m, sec - (sec % 60), m, sol, MAX_1M);
  }

  private prune() {
    if (this.coins.size <= this.opts.maxCoins) return;
    for (const c of this.coins.values()) {
      if (this.coins.size <= this.opts.maxCoins) break;
      if (c.dead && !this.positions.has(c.id)) this.coins.delete(c.id);
    }
  }

  // ---------- player ----------

  /** Queue an order. It lands after network latency, so the price can move against you. */
  submit(req: OrderRequest): { ok: true; id: number } | { ok: false; reason: string } {
    const c = this.coins.get(req.coinId);
    if (!c) return { ok: false, reason: "Coin not found" };
    if (!(req.amount > 0)) return { ok: false, reason: "Enter an amount" };
    if (req.side === "buy") {
      if (req.amount + req.priorityFeeSol > this.sol) return { ok: false, reason: "Insufficient SOL" };
      this.sol -= req.amount + req.priorityFeeSol; // held until the order lands
    } else {
      const held = this.positions.get(req.coinId)?.tokens ?? 0;
      const locked = this.pending
        .filter((o) => o.side === "sell" && o.coinId === req.coinId)
        .reduce((s, o) => s + o.amount, 0);
      if (req.amount > held - locked + 1e-6) return { ok: false, reason: "Insufficient tokens" };
      if (req.priorityFeeSol > this.sol) return { ok: false, reason: "Insufficient SOL for fee" };
      this.sol -= req.priorityFeeSol;
    }
    const quote =
      req.side === "buy"
        ? quoteBuy(c.r, req.amount * (1 - PLATFORM_FEE)).tokensOut
        : quoteSell(c.r, req.amount).solOut * (1 - PLATFORM_FEE);
    // Retail orders land 1-3 slots later; a bigger priority fee skips most of the queue.
    const latency = this.rng.range(300, 800) + 1000 * Math.exp(-req.priorityFeeSol / 0.002) * this.rng.next();
    const id = this.nextId++;
    this.pending.push({ ...req, id, executeAt: this.time + latency, minOut: quote * (1 - req.slippagePct / 100) });
    return { ok: true, id };
  }

  private executeOrders() {
    if (!this.pending.length) return;
    const due = this.pending.filter((o) => o.executeAt <= this.time);
    if (!due.length) return;
    this.pending = this.pending.filter((o) => o.executeAt > this.time);
    for (const o of due) this.fill(o);
  }

  private fill(o: PendingOrder) {
    const c = this.coins.get(o.coinId)!;
    const base = {
      id: o.id, t: this.time, coinId: c.id, ticker: c.ticker, side: o.side,
      mcapUsd: mcapUsd(c.r), priorityFee: o.priorityFeeSol, ...(o.tag && { bot: o.tag }),
    };
    const pos = this.positions.get(c.id) ?? {
      coinId: c.id, ticker: c.ticker, tokens: 0, costSol: 0, realizedSol: 0, boughtSol: 0, soldSol: 0,
    };
    const fail = (reason: string) => {
      if (o.side === "buy") this.sol += o.amount;
      pos.realizedSol -= o.priorityFeeSol;
      if (this.positions.has(c.id)) this.positions.set(c.id, pos);
      this.history.push({ ...base, status: "failed", reason, sol: 0, tokens: 0, fee: 0 });
    };

    if (o.side === "buy") {
      const platformFee = o.amount * PLATFORM_FEE;
      const swapIn = o.amount - platformFee;
      const q = quoteBuy(c.r, swapIn);
      if (q.tokensOut < o.minOut) return fail("Slippage exceeded");
      if (c.kinds.get("you") !== "dev") c.kinds.set("you", "you");
      this.buy(c, "you", swapIn);
      this.sol += swapIn - q.solUsed; // refund if the curve filled partially
      const spent = q.solUsed + platformFee;
      pos.tokens += q.tokensOut;
      pos.costSol += spent + o.priorityFeeSol;
      pos.boughtSol += spent;
      this.positions.set(c.id, pos);
      this.history.push({ ...base, status: "ok", sol: spent, tokens: q.tokensOut, fee: q.fee + platformFee, mcapUsd: mcapUsd(c.r) });
    } else {
      const tokens = Math.min(o.amount, pos.tokens);
      if (tokens <= 0) return fail("Nothing to sell");
      const q = quoteSell(c.r, tokens);
      const platformFee = q.solOut * PLATFORM_FEE;
      const received = q.solOut - platformFee;
      if (received < o.minOut) return fail("Slippage exceeded");
      this.sell(c, "you", tokens);
      const frac = tokens / pos.tokens;
      // Your own coin: dumping half or more of your dev bag is a rug; a smaller dump spooks buyers.
      let rug = false;
      if (c.mine && c.ruggedAt === undefined) {
        if (frac >= 0.5) {
          c.ruggedAt = this.time;
          rug = true;
        } else {
          c.noise -= frac; // sentiment hit, e.g. -0.3 for a 30% dump
        }
      }
      const cost = pos.costSol * frac;
      pos.tokens -= tokens;
      pos.costSol -= cost;
      const pnlSol = received - cost - o.priorityFeeSol;
      pos.realizedSol += pnlSol;
      pos.soldSol += received;
      if (pos.tokens < 1) pos.tokens = 0;
      this.sol += received;
      this.positions.set(c.id, pos);
      const closed = pos.tokens === 0;
      this.history.push({
        ...base, status: "ok", sol: received, tokens, fee: q.fee + platformFee, mcapUsd: mcapUsd(c.r),
        pnlSol, pnlPct: cost > 0 ? (pnlSol / cost) * 100 : 0, soldPct: frac * 100,
        ...(rug && { note: "rug" as const }),
        ...(closed && { positionPnlSol: pos.realizedSol, positionPnlPct: (pos.realizedSol / pos.boughtSol) * 100 }),
      });
    }
  }

  // ---------- shared (multiplayer) coins ----------
  // Coins players launched publicly live on the server. Here they are read-only mirrors:
  // they never tick locally, and your orders on them are settled by the server.

  /** Create or refresh the mirror of a shared coin. */
  upsertShared(s: SharedState, me: string | null): Coin {
    const id = "s_" + s.uuid;
    let c = this.coins.get(id);
    if (!c) {
      const plan = makePlan(new Rng(s.hue + 1));
      Object.assign(plan, { socials: s.socials, rugAt: undefined, devSellAt: undefined, kolAt: undefined });
      c = this.newCoin(plan, s.name, s.ticker, s.hue, "@" + s.creator, id);
      c.startMcap = mcapUsd(newReserves());
      c.trades = [];
    }
    const mine = !!me && s.creator.toLowerCase() === me.toLowerCase();
    c.shared = { uuid: s.uuid, creator: s.creator };
    c.mine = mine;
    c.dev = mine ? "you" : "@" + s.creator;
    c.kinds.set(c.dev, "dev");
    c.createdAt = s.createdAt;
    c.r = { phase: s.phase, rSol: s.rSol, rTok: s.rTok, tokensSold: s.tokensSold, realSol: s.realSol };
    c.athMcap = s.athMcapUsd;
    c.volumeSol = s.volumeSol;
    c.buys = s.buys;
    c.sells = s.sells;
    c.lastTradeAt = s.lastTradeAt;
    c.ruggedAt = s.ruggedAt;
    if (s.ruggedAt !== undefined) c.devSold = true;
    if (s.phase === "graduated" && c.graduatedAt === undefined) c.graduatedAt = s.lastTradeAt;
    c.dead = false;
    return c;
  }

  /** Holders of a shared coin: players by name, plus the simulated crowd as one wallet. */
  setSharedHolders(c: Coin, holders: { username: string; tokens: number }[], crowdTokens: number, me: string | null) {
    c.holders = new Map();
    c.holderList = [];
    c.holderIdx = new Map();
    const add = (w: string, b: number, kind: WalletKind) => {
      if (b < 1) return;
      c.kinds.set(w, c.kinds.get(w) === "dev" ? "dev" : kind);
      c.holderIdx.set(w, c.holderList.length);
      c.holderList.push(w);
      c.holders.set(w, b);
    };
    for (const h of holders) {
      const isMe = !!me && h.username.toLowerCase() === me.toLowerCase();
      add(isMe ? "you" : "@" + h.username, h.tokens, isMe ? "you" : "trader");
    }
    add("crowd", crowdTokens, "trader");
  }

  /** A trade that happened on the server (anyone's): chart and tape only, reserves come from upsertShared. */
  ingestSharedTrade(c: Coin, t: { at: number; side: Side; sol: number; tokens: number; wallet: string; mcapUsd: number }) {
    c.trades.push({ t: t.at, side: t.side, sol: t.sol, tokens: t.tokens, wallet: t.wallet, kind: c.kinds.get(t.wallet) ?? "trader", mcapUsd: t.mcapUsd });
    if (c.trades.length > MAX_TRADES) c.trades.splice(0, c.trades.length - MAX_TRADES);
    const sec = Math.floor(t.at / 1000);
    addToCandles(c.candles, sec, t.mcapUsd, t.sol, MAX_1S);
    addToCandles(c.candles1m, sec - (sec % 60), t.mcapUsd, t.sol, MAX_1M);
  }

  /**
   * Reserve funds for an order the server will settle. Returns the minimum the server must
   * give you (your slippage limit), computed from the price you see now.
   */
  externalOrder(req: OrderRequest): { ok: true; id: number; minOut: number } | { ok: false; reason: string } {
    const c = this.coins.get(req.coinId);
    if (!c?.shared) return { ok: false, reason: "Not a shared coin" };
    if (!(req.amount > 0)) return { ok: false, reason: "Enter an amount" };
    const held = this.positions.get(req.coinId)?.tokens ?? 0;
    if (req.side === "buy") {
      if (req.amount + req.priorityFeeSol > this.sol) return { ok: false, reason: "Insufficient SOL" };
      this.sol -= req.amount + req.priorityFeeSol;
    } else {
      const locked = this.pending.filter((o) => o.side === "sell" && o.coinId === req.coinId).reduce((s, o) => s + o.amount, 0);
      if (req.amount > held - locked + 1e-6) return { ok: false, reason: "Insufficient tokens" };
      if (req.priorityFeeSol > this.sol) return { ok: false, reason: "Insufficient SOL for fee" };
      this.sol -= req.priorityFeeSol;
    }
    const quote = req.side === "buy"
      ? quoteBuy(c.r, req.amount * (1 - PLATFORM_FEE)).tokensOut
      : quoteSell(c.r, req.amount).solOut * (1 - PLATFORM_FEE);
    const id = this.nextId++;
    const minOut = quote * (1 - req.slippagePct / 100);
    this.pending.push({ ...req, id, executeAt: Infinity, minOut }); // settled by externalFill/externalFail
    return { ok: true, id, minOut };
  }

  /** The server settled an external order. */
  externalFill(id: number, r: { tokens: number; sol: number; fee: number; mcapUsd: number; rug: boolean }) {
    const o = this.takePending(id);
    if (!o) return;
    const c = this.coins.get(o.coinId);
    const ticker = c?.ticker ?? "?";
    const base = { id: o.id, t: this.time, coinId: o.coinId, ticker, side: o.side, mcapUsd: r.mcapUsd, priorityFee: o.priorityFeeSol };
    const pos = this.positions.get(o.coinId) ?? {
      coinId: o.coinId, ticker, tokens: 0, costSol: 0, realizedSol: 0, boughtSol: 0, soldSol: 0,
    };
    if (o.side === "buy") {
      this.sol += o.amount - r.sol; // server may have filled less
      pos.tokens += r.tokens;
      pos.costSol += r.sol + o.priorityFeeSol;
      pos.boughtSol += r.sol;
      this.positions.set(o.coinId, pos);
      this.history.push({ ...base, status: "ok", sol: r.sol, tokens: r.tokens, fee: r.fee });
      return;
    }
    const frac = pos.tokens > 0 ? Math.min(1, r.tokens / pos.tokens) : 1;
    const cost = pos.costSol * frac;
    const pnlSol = r.sol - cost - o.priorityFeeSol;
    pos.tokens = Math.max(0, pos.tokens - r.tokens);
    if (pos.tokens < 1) pos.tokens = 0;
    pos.costSol -= cost;
    pos.realizedSol += pnlSol;
    pos.soldSol += r.sol;
    this.sol += r.sol;
    this.positions.set(o.coinId, pos);
    const closed = pos.tokens === 0;
    this.history.push({
      ...base, status: "ok", sol: r.sol, tokens: r.tokens, fee: r.fee,
      pnlSol, pnlPct: cost > 0 ? (pnlSol / cost) * 100 : 0, soldPct: frac * 100,
      ...(r.rug && { note: "rug" as const }),
      ...(closed && pos.boughtSol > 0 && { positionPnlSol: pos.realizedSol, positionPnlPct: (pos.realizedSol / pos.boughtSol) * 100 }),
    });
  }

  /** The server refused an external order: refund, but the priority fee is gone. */
  externalFail(id: number, reason: string) {
    const o = this.takePending(id);
    if (!o) return;
    if (o.side === "buy") this.sol += o.amount;
    const c = this.coins.get(o.coinId);
    const pos = this.positions.get(o.coinId);
    if (pos) pos.realizedSol -= o.priorityFeeSol;
    this.history.push({
      id: o.id, t: this.time, coinId: o.coinId, ticker: c?.ticker ?? "?", side: o.side, status: "failed", reason,
      sol: 0, tokens: 0, fee: 0, mcapUsd: c ? mcapUsd(c.r) : 0, priorityFee: o.priorityFeeSol,
    });
  }

  /** Record a public launch you made on the server (creation fee + dev buy). */
  externalLaunch(coinId: string, ticker: string, devSol: number, tokens: number, mcap: number) {
    this.sol -= CREATE_FEE_SOL + devSol;
    this.positions.set(coinId, {
      coinId, ticker, tokens, costSol: devSol, realizedSol: -CREATE_FEE_SOL, boughtSol: devSol, soldSol: 0,
    });
    this.history.push({
      id: this.nextId++, t: this.time, coinId, ticker, side: "buy", status: "ok", note: "launch",
      sol: devSol, tokens, mcapUsd: mcap, fee: devSol * 0.02 + CREATE_FEE_SOL, priorityFee: 0,
    });
  }

  private takePending(id: number): PendingOrder | undefined {
    const i = this.pending.findIndex((o) => o.id === id);
    return i < 0 ? undefined : this.pending.splice(i, 1)[0];
  }

  /** What your bag would sell for right now (after fees and price impact). */
  positionValue(coinId: string): number {
    const pos = this.positions.get(coinId);
    const c = this.coins.get(coinId);
    if (!pos || !c || pos.tokens <= 0) return 0;
    return quoteSell(c.r, pos.tokens).solOut * (1 - PLATFORM_FEE);
  }

  equity(): number {
    let v = this.sol;
    for (const o of this.pending) if (o.side === "buy") v += o.amount;
    for (const id of this.positions.keys()) v += this.positionValue(id);
    return v;
  }
}
