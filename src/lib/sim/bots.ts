import { SOL_USD } from "./curve";
import type { Market } from "./market";
import { getAccount, type Social, type Tier } from "./social";
import { coinStats } from "./stats";

/**
 * Your trading bots. They watch the market (and the 𝕏 feed) every tick, buy what
 * matches their filters through the normal order path (latency, slippage, fees),
 * and sell automatically on take profit / stop loss / time limit.
 */

export type BotKind = "sniper" | "posts" | "migration";

/** When to sell automatically. null = rule off. */
export interface ExitRules {
  takeProfitPct: number | null; // sell all at +X%
  stopLossPct: number | null; // sell all at -X%
  maxHoldSec: number | null; // sell all after X seconds
}

interface BuyConfig {
  enabled: boolean;
  buySol: number;
  slippagePct: number;
  priorityFeeSol: number;
  budgetSol: number; // stop buying after this much SOL spent (0 = no limit)
  exit: ExitRules;
}

export interface SniperConfig extends BuyConfig {
  maxAgeSec: number; // only coins at most this old when seen
  requireSocials: boolean;
  maxDevPct: number;
  maxBundlePct: number;
  maxStartMcapSol: number; // skip coins that launched already pumped by dev/bundle buys
  maxDevRugs: number; // skip devs who rugged more than this many coins before
}

export interface PostsConfig extends BuyConfig {
  tiers: Tier[]; // whose posts to follow
}

export type MigrationConfig = BuyConfig;

export interface BotsConfig {
  sniper: SniperConfig;
  posts: PostsConfig;
  migration: MigrationConfig;
}

export const DEFAULT_BOTS: BotsConfig = {
  sniper: {
    enabled: false, buySol: 0.2, slippagePct: 30, priorityFeeSol: 0.003, budgetSol: 5,
    maxAgeSec: 3, requireSocials: false, maxDevPct: 10, maxBundlePct: 10, maxStartMcapSol: 50, maxDevRugs: 0,
    exit: { takeProfitPct: 100, stopLossPct: 35, maxHoldSec: 120 },
  },
  posts: {
    enabled: false, buySol: 0.3, slippagePct: 30, priorityFeeSol: 0.003, budgetSol: 5,
    tiers: ["mega", "kol"],
    exit: { takeProfitPct: 60, stopLossPct: 25, maxHoldSec: 90 },
  },
  migration: {
    enabled: false, buySol: 0.5, slippagePct: 20, priorityFeeSol: 0.001, budgetSol: 5,
    exit: { takeProfitPct: 50, stopLossPct: 25, maxHoldSec: 600 },
  },
};

export const BOT_LABEL: Record<BotKind | "manual", string> = {
  sniper: "Launch sniper",
  posts: "Post sniper",
  migration: "Migration sniper",
  manual: "Auto-sell",
};

export interface BotStats {
  buys: number; // buys that landed or are in flight
  failed: number; // buys that failed on slippage
  closed: number;
  wins: number;
  spentSol: number;
  pnlSol: number;
}

export interface BotLog {
  id: number;
  t: number; // sim ms
  bot: BotKind | "manual";
  text: string;
  tone: "buy" | "good" | "bad" | "info";
  coinId?: string;
}

interface Managed {
  bot: BotKind | "manual";
  since: number; // sim ms of the buy (or when the rule was set)
  exit: ExitRules;
  selling?: boolean;
  // the position before this bot touched it, so only its own trade is counted
  baseRealized: number;
  baseBought: number;
}

export interface BotsSave {
  stats: Record<BotKind, BotStats>;
  managed: [string, Omit<Managed, "since"> & { heldMs: number }][];
}

const EXIT_SLIPPAGE = 50; // exits are market dumps: get out
const BUY_TIMEOUT_MS = 5000;
const MAX_LOG = 100;

const emptyStats = (): BotStats => ({ buys: 0, failed: 0, closed: 0, wins: 0, spentSol: 0, pnlSol: 0 });

export class Bots {
  config: BotsConfig;
  stats: Record<BotKind, BotStats> = { sniper: emptyStats(), posts: emptyStats(), migration: emptyStats() };
  log: BotLog[] = []; // newest first
  managed = new Map<string, Managed>(); // coinId -> who manages the position
  private seen = new Set<string>(); // coins the sniper already judged
  private lastTweetId = -1;
  private lastScan = -1;
  private nextId = 1;

  constructor(config: BotsConfig = DEFAULT_BOTS) {
    this.config = structuredClone(config);
  }

  /** Call after every market step. */
  step(m: Market, s?: Social): void {
    if (this.lastScan < 0) {
      // first tick: don't react to history from before the bots existed
      this.lastScan = m.time;
      this.lastTweetId = s?.feed[0]?.id ?? 0;
      for (const id of m.coins.keys()) this.seen.add(id);
      return;
    }
    this.sniper(m);
    if (s) this.posts(m, s);
    this.migration(m);
    this.exits(m);
    this.lastScan = m.time;
  }

  // ---------- buyers ----------

  private sniper(m: Market) {
    const cfg = this.config.sniper;
    for (const c of m.coins.values()) {
      if (this.seen.has(c.id)) continue;
      this.seen.add(c.id);
      if (!cfg.enabled || c.mine) continue;
      const st = coinStats(c, m.time);
      if (st.ageSec > cfg.maxAgeSec) continue;
      const startSol = c.startMcap / SOL_USD;
      const hasSocials = c.plan.socials.x || c.plan.socials.tg || c.plan.socials.web;
      const why =
        cfg.requireSocials && !hasSocials ? "no socials"
        : st.devPct > cfg.maxDevPct ? `dev ${st.devPct.toFixed(1)}%`
        : st.bundlePct > cfg.maxBundlePct ? `bundle ${st.bundlePct.toFixed(1)}%`
        : startSol > cfg.maxStartMcapSol ? `launched at ${startSol.toFixed(0)} SOL MC`
        : st.devPrevRugs > cfg.maxDevRugs ? `dev rugged ${st.devPrevRugs} before`
        : null;
      if (why) continue; // filtered out quietly; there are a lot of launches
      this.buy(m, "sniper", c.id, c.ticker, `dev ${st.devPct.toFixed(1)}% · bundle ${st.bundlePct.toFixed(1)}%`);
    }
    if (this.seen.size > 5000) this.seen = new Set([...m.coins.keys()]);
  }

  private posts(m: Market, s: Social) {
    const cfg = this.config.posts;
    const fresh = s.feed.filter((t) => t.id > this.lastTweetId);
    if (fresh.length) this.lastTweetId = fresh[0].id;
    if (!cfg.enabled) return;
    for (const t of fresh.reverse()) {
      const acc = getAccount(t.author);
      if (!acc || !cfg.tiers.includes(acc.tier)) continue;
      const targets = [...(t.pumped ?? []).map((p) => p.coinId), ...Object.values(t.links)];
      for (const id of new Set(targets)) {
        const c = m.coins.get(id);
        if (!c || c.dead || c.mine) continue;
        this.buy(m, "posts", id, c.ticker, `@${acc.id} posted`);
      }
    }
  }

  private migration(m: Market) {
    const cfg = this.config.migration;
    if (!cfg.enabled) return;
    for (const c of m.coins.values()) {
      if (c.graduatedAt === undefined || c.graduatedAt <= this.lastScan || c.mine) continue;
      this.buy(m, "migration", c.id, c.ticker, "just migrated");
    }
  }

  private buy(m: Market, bot: BotKind, coinId: string, ticker: string, reason: string) {
    const cfg = this.config[bot];
    const st = this.stats[bot];
    if (this.managed.has(coinId) || (m.positions.get(coinId)?.tokens ?? 0) > 0) return; // one bag per coin
    if (cfg.budgetSol > 0 && st.spentSol + cfg.buySol > cfg.budgetSol + 1e-9) {
      return this.note(bot, `Budget used up (${st.spentSol.toFixed(2)} SOL). Skipped $${ticker}`, "info", coinId, true);
    }
    const res = m.submit({
      coinId, side: "buy", amount: cfg.buySol, slippagePct: cfg.slippagePct, priorityFeeSol: cfg.priorityFeeSol,
      tag: BOT_LABEL[bot],
    });
    if (!res.ok) return this.note(bot, `Couldn't buy $${ticker}: ${res.reason}`, "bad", coinId, true);
    st.buys++;
    st.spentSol += cfg.buySol;
    const prev = m.positions.get(coinId);
    this.managed.set(coinId, {
      bot, since: m.time, exit: { ...cfg.exit }, baseRealized: prev?.realizedSol ?? 0, baseBought: prev?.boughtSol ?? 0,
    });
    this.note(bot, `Buying $${ticker} for ${cfg.buySol} SOL (${reason})`, "buy", coinId);
  }

  // ---------- auto-sell ----------

  /** Set (or clear with null) take profit / stop loss on any position you hold. */
  setExit(m: Market, coinId: string, exit: ExitRules | null) {
    const cur = this.managed.get(coinId);
    if (!exit || (exit.takeProfitPct === null && exit.stopLossPct === null && exit.maxHoldSec === null)) {
      if (cur?.bot === "manual") this.managed.delete(coinId);
      else if (cur) cur.exit = { takeProfitPct: null, stopLossPct: null, maxHoldSec: null };
      return;
    }
    if (cur) cur.exit = exit;
    else {
      const p = m.positions.get(coinId);
      this.managed.set(coinId, { bot: "manual", since: m.time, exit, baseRealized: p?.realizedSol ?? 0, baseBought: p?.boughtSol ?? 0 });
    }
  }

  private exits(m: Market) {
    for (const [coinId, g] of this.managed) {
      const pos = m.positions.get(coinId);
      const pendingBuy = m.pending.some((o) => o.coinId === coinId && o.side === "buy");
      if (!pos || pos.tokens <= 0) {
        if (pendingBuy) continue;
        const bought = (pos?.boughtSol ?? 0) > g.baseBought;
        if (bought && (g.selling || m.time - g.since > BUY_TIMEOUT_MS)) {
          // position closed (by us or by hand): book this bot's result
          if (g.bot !== "manual") {
            const pnl = pos!.realizedSol - g.baseRealized;
            const st = this.stats[g.bot];
            st.closed++;
            st.pnlSol += pnl;
            if (pnl > 0) st.wins++;
          }
          this.managed.delete(coinId);
        } else if (!bought && m.time - g.since > BUY_TIMEOUT_MS) {
          if (g.bot !== "manual") {
            // the SOL came back, only the priority fee is gone
            const st = this.stats[g.bot];
            st.failed++;
            st.buys--;
            st.spentSol -= this.config[g.bot].buySol;
            st.pnlSol -= this.config[g.bot].priorityFeeSol;
            this.note(g.bot, "Buy failed (price moved past slippage). Moving on", "bad", coinId, true);
          }
          this.managed.delete(coinId);
        }
        continue;
      }
      if (g.selling || m.pending.some((o) => o.coinId === coinId && o.side === "sell")) continue;
      const pnlPct = (m.positionValue(coinId) / pos.costSol - 1) * 100;
      const heldSec = (m.time - g.since) / 1000;
      const { takeProfitPct: tp, stopLossPct: sl, maxHoldSec: hold } = g.exit;
      const reason =
        tp !== null && pnlPct >= tp ? `take profit hit (${pnlPct.toFixed(0)}%)`
        : sl !== null && pnlPct <= -sl ? `stop loss hit (${pnlPct.toFixed(0)}%)`
        : hold !== null && heldSec >= hold ? `held ${Math.round(heldSec)}s`
        : null;
      if (!reason) continue;
      const res = m.submit({
        coinId, side: "sell", amount: pos.tokens, slippagePct: EXIT_SLIPPAGE,
        priorityFeeSol: g.bot === "manual" ? 0.001 : this.config[g.bot].priorityFeeSol, tag: BOT_LABEL[g.bot],
      });
      if (!res.ok) continue;
      g.selling = true;
      this.note(g.bot, `Selling $${pos.ticker}: ${reason}`, pnlPct >= 0 ? "good" : "bad", coinId);
    }
  }

  private note(bot: BotLog["bot"], text: string, tone: BotLog["tone"], coinId?: string, dedupe = false) {
    if (dedupe && this.log[0]?.text === text) return;
    this.log.unshift({ id: this.nextId++, t: this.lastScan, bot, text, tone, coinId });
    if (this.log.length > MAX_LOG) this.log.length = MAX_LOG;
  }

  // ---------- persistence ----------

  save(now: number): BotsSave {
    return {
      stats: this.stats,
      // a sell in flight is cancelled by the save, so it will simply re-trigger after loading
      managed: [...this.managed].map(([id, g]) => {
        const { since, ...rest } = g;
        return [id, { ...rest, selling: false, heldMs: now - since }];
      }),
    };
  }

  load(s: BotsSave, now: number) {
    this.stats = { ...this.stats, ...s.stats };
    for (const [id, g] of s.managed) {
      const { heldMs, ...rest } = g;
      this.managed.set(id, { ...rest, since: now - heldMs });
    }
  }
}
