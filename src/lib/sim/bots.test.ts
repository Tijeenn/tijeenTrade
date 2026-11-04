import { describe, expect, it } from "vitest";
import { Bots, DEFAULT_BOTS, type BotsConfig } from "./bots";
import { Market } from "./market";
import { Social } from "./social";
import { coinStats } from "./stats";

function run(cfg: (c: BotsConfig) => void, minutes = 3, seed = 9) {
  const m = new Market({ seed, startSol: 100 });
  const s = new Social(seed);
  const c = structuredClone(DEFAULT_BOTS);
  cfg(c);
  const b = new Bots(c);
  m.step(5 * 60_000);
  b.step(m, s); // first tick only marks what already exists
  const end = m.time + minutes * 60_000;
  while (m.time < end) {
    m.step(100);
    s.step(m);
    b.step(m, s);
  }
  return { m, s, b };
}

describe("launch sniper", () => {
  it("buys fresh launches that pass the filters, never old or bundled coins", () => {
    const { m, b } = run((c) => {
      c.sniper.enabled = true;
      c.sniper.budgetSol = 0;
      c.sniper.maxBundlePct = 5;
    });
    const buys = m.history.filter((h) => h.side === "buy" && h.bot === "Launch sniper");
    expect(buys.length).toBeGreaterThan(3);
    for (const h of buys) {
      const c = m.coins.get(h.coinId)!;
      expect(h.t - c.createdAt).toBeLessThan(5000); // decided within maxAgeSec, landed after latency
      expect(c.plan.bundleWallets === 0 || c.plan.stealth || c.plan.bundleSol < 10).toBe(true);
    }
    expect(b.stats.sniper.buys + b.stats.sniper.failed).toBeGreaterThanOrEqual(buys.length);
  });

  it("is off by default and respects the budget", () => {
    expect(run(() => {}, 1).m.history.length).toBe(0);
    const { b } = run((c) => {
      c.sniper.enabled = true;
      c.sniper.budgetSol = 0.4;
      c.sniper.maxBundlePct = 100;
      c.sniper.maxDevPct = 100;
    });
    expect(b.stats.sniper.spentSol).toBeLessThanOrEqual(0.4 + 1e-9);
    expect(b.stats.sniper.buys).toBeLessThanOrEqual(2);
  });

  it("auto-sells: every bought position gets closed by its exit rules", () => {
    const { m, b } = run((c) => {
      c.sniper.enabled = true;
      c.sniper.budgetSol = 0;
      c.sniper.exit = { takeProfitPct: 30, stopLossPct: 20, maxHoldSec: 20 };
    }, 4);
    const st = b.stats.sniper;
    expect(st.closed).toBeGreaterThan(3);
    const sells = m.history.filter((h) => h.side === "sell" && h.status === "ok" && h.bot === "Launch sniper");
    expect(sells.length).toBeGreaterThanOrEqual(st.closed);
    // anything still open was bought in the last ~20s
    for (const [id, g] of b.managed) {
      if ((m.positions.get(id)?.tokens ?? 0) > 0) expect(m.time - g.since).toBeLessThan(25_000);
    }
  });
});

describe("post sniper", () => {
  it("buys coins that followed accounts post about", () => {
    const { m } = run((c) => {
      c.posts.enabled = true;
      c.posts.budgetSol = 0;
      c.posts.tiers = ["mega", "kol", "degen"];
    }, 5);
    const buys = m.history.filter((h) => h.side === "buy" && h.bot === "Post sniper");
    expect(buys.length).toBeGreaterThan(0);
    for (const h of buys) expect(m.coins.get(h.coinId)?.hypedAt).toBeDefined();
  });
});

describe("manual auto-sell", () => {
  it("sells your own position when the stop loss or take profit hits", () => {
    const m = new Market({ seed: 4, startSol: 100 });
    const b = new Bots();
    m.step(120_000);
    b.step(m);
    const c = [...m.coins.values()].find((x) => !x.dead && x.r.phase === "curve" && m.time - x.lastTradeAt < 2000)!;
    m.submit({ coinId: c.id, side: "buy", amount: 1, slippagePct: 50, priorityFeeSol: 0.01 });
    m.step(2000);
    expect(m.positions.get(c.id)!.tokens).toBeGreaterThan(0);
    // a 1% band can't survive a minute of memecoin volatility
    b.setExit(m, c.id, { takeProfitPct: 1, stopLossPct: 1, maxHoldSec: null });
    for (let i = 0; i < 600 && (m.positions.get(c.id)?.tokens ?? 0) > 0; i++) {
      m.step(100);
      b.step(m);
    }
    expect(m.positions.get(c.id)!.tokens).toBe(0);
    expect(m.history.at(-1)!.bot).toBe("Auto-sell");
    b.setExit(m, c.id, null);
  });

  it("keeps managed positions and stats across a save", () => {
    const { m, b } = run((c) => {
      c.sniper.enabled = true;
      c.sniper.budgetSol = 0;
      c.sniper.exit = { takeProfitPct: null, stopLossPct: null, maxHoldSec: null };
    }, 1);
    const saved = JSON.parse(JSON.stringify(b.save(m.time)));
    const b2 = new Bots(b.config);
    b2.load(saved, m.time + 1000);
    expect(b2.stats.sniper).toEqual(b.stats.sniper);
    expect([...b2.managed.keys()].sort()).toEqual([...b.managed.keys()].sort());
    const [id, g] = [...b.managed][0];
    expect(b2.managed.get(id)!.since).toBe(g.since + 1000);
    expect(coinStats(m.coins.get(id)!, m.time)).toBeDefined();
  });
});
