import {
  applyBuy, applySell, graduate, mcapUsd, newReserves, quoteBuy, quoteSell, shouldGraduate,
  type Reserves,
} from "./curve";
import { address, coinName } from "./names";
import { activity, makePlan, targetMcap, type Plan } from "./plan";
import { Rng } from "./rng";

export type Side = "buy" | "sell";
export type WalletKind = "dev" | "bundle" | "sniper" | "kol" | "trader" | "you";

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
}

export interface OrderRequest {
  coinId: string;
  side: Side;
  amount: number; // SOL for buys, tokens for sells
  slippagePct: number;
  priorityFeeSol: number;
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
/** Trading-terminal fee on your trades (like Axiom/BullX), on top of the curve/pool fee. */
export const PLATFORM_FEE = 0.01;

export class Market {
  time = 0;
  rng: Rng;
  coins = new Map<string, Coin>();
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
      while (this.time >= this.nextSpawnAt) {
        this.spawn();
        this.nextSpawnAt += this.rng.range(0.25, 1.75) * this.opts.spawnEverySec * 1000;
      }
      for (const c of this.coins.values()) if (!c.dead) this.tickCoin(c, sub / 1000);
      this.executeOrders();
    }
    this.prune();
  }

  // ---------- coins ----------

  spawn(): Coin {
    const rng = this.rng;
    const plan = makePlan(rng);
    const { name, ticker } = coinName(rng);
    const dev = address(rng);
    const c: Coin = {
      id: address(rng, 32) + "pump",
      name,
      ticker,
      hue: rng.int(0, 359),
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
    };
    this.coins.set(c.id, c);

    if (plan.devSol > 0) this.buy(c, dev, plan.devSol);
    for (let i = 0; i < plan.bundleWallets; i++) {
      const w = this.newWallet(c, "bundle");
      this.buy(c, w, (plan.bundleSol / plan.bundleWallets) * rng.range(0.6, 1.4));
    }
    c.startMcap = mcapUsd(c.r);

    const at = (sec: number) => c.createdAt + sec * 1000;
    for (let i = 0; i < plan.snipers; i++) {
      const w = this.newWallet(c, "sniper");
      c.scheduled.push({ at: at(rng.range(0.2, 1.5)), wallet: w, buySol: rng.logNormal(0.8, 0.6) });
      c.scheduled.push({ at: at(rng.range(3, 45)), wallet: w, sellFrac: 1 });
    }
    if (plan.devSellAt !== undefined)
      c.scheduled.push({ at: at(plan.devSellAt), wallet: dev, sellFrac: plan.devSellFrac ?? 1 });
    if (plan.rugAt !== undefined) {
      c.scheduled.push({ at: at(plan.rugAt), wallet: dev, sellFrac: 1 });
      for (const [w, k] of c.kinds)
        if (k === "bundle") c.scheduled.push({ at: at(plan.rugAt + rng.range(0, 2)), wallet: w, sellFrac: 1 });
    }
    if (plan.kolAt !== undefined) {
      const w = this.newWallet(c, "kol");
      c.scheduled.push({ at: at(plan.kolAt), wallet: w, buySol: rng.range(3, 15) });
      c.scheduled.push({ at: at(plan.kolAt + rng.range(20, 300)), wallet: w, sellFrac: 1 });
    }
    c.scheduled.sort((a, b) => a.at - b.at);
    return c;
  }

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

    const rugged = p.rugAt !== undefined && age >= p.rugAt;
    c.noise += -0.2 * c.noise * dt + 0.18 * Math.sqrt(dt) * rng.normal();

    const mcap = mcapUsd(c.r);
    let rate = p.baseRate * activity(p, age) * Math.min(3, Math.pow(Math.max(1, mcap / c.startMcap), 0.2));
    // After a rug: a burst of panic selling, then silence.
    if (rugged) rate = p.baseRate * 4 * Math.exp(-(age - p.rugAt!) / 15);

    const n = rng.poisson(rate * dt);
    for (let i = 0; i < n; i++) {
      const cur = mcapUsd(c.r);
      let pBuy = 0.15;
      if (!rugged) {
        const err = Math.log((targetMcap(p, c.startMcap, age) * Math.exp(c.noise)) / cur);
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
      if (k === "you" || k === "dev" || k === "kol" || (protectInsiders && k === "bundle")) continue;
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
    const latency = this.rng.range(150, 500) + 400 * Math.exp(-req.priorityFeeSol / 0.001) * this.rng.next();
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
      mcapUsd: mcapUsd(c.r), priorityFee: o.priorityFeeSol,
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
      c.kinds.set("you", "you");
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
      const cost = pos.costSol * frac;
      pos.tokens -= tokens;
      pos.costSol -= cost;
      pos.realizedSol += received - cost - o.priorityFeeSol;
      pos.soldSol += received;
      if (pos.tokens < 1) pos.tokens = 0;
      this.sol += received;
      this.positions.set(c.id, pos);
      this.history.push({ ...base, status: "ok", sol: received, tokens, fee: q.fee + platformFee, mcapUsd: mcapUsd(c.r) });
    }
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
