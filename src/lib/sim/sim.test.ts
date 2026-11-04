import { describe, expect, it } from "vitest";
import {
  applyBuy, applySell, CURVE_TOKENS, graduate, mcapUsd, newReserves, price, quoteBuy, quoteSell,
} from "./curve";
import { Market, PLATFORM_FEE } from "./market";

describe("bonding curve", () => {
  it("launches around $4.2k and completes around $60k", () => {
    const r = newReserves();
    expect(mcapUsd(r)).toBeGreaterThan(4000);
    expect(mcapUsd(r)).toBeLessThan(4500);
    const q = quoteBuy(r, 1000); // way more than needed: fills the rest of the curve
    expect(q.tokensOut).toBeCloseTo(CURVE_TOKENS, 0);
    applyBuy(r, q);
    expect(mcapUsd(r)).toBeGreaterThan(55000);
    expect(mcapUsd(r)).toBeLessThan(70000);
    expect(r.realSol).toBeGreaterThan(80);
    expect(r.realSol).toBeLessThan(90);
  });

  it("charges ~1% each way on a round trip", () => {
    const r = newReserves();
    const q = quoteBuy(r, 1);
    applyBuy(r, q);
    const s = quoteSell(r, q.tokensOut);
    applySell(r, q.tokensOut, s);
    expect(s.solOut).toBeCloseTo(0.99 * 0.99, 3);
    expect(mcapUsd(r)).toBeCloseTo(mcapUsd(newReserves()), 3);
  });

  it("keeps the price when migrating to the pool", () => {
    const r = newReserves();
    applyBuy(r, quoteBuy(r, 1000));
    const before = price(r);
    graduate(r);
    expect(r.phase).toBe("graduated");
    expect(price(r)).toBeCloseTo(before, 12);
    expect(r.rSol).toBeCloseTo(r.realSol, 9);
  });
});

function runningMarket(seed = 1, minutes = 2) {
  const m = new Market({ seed, startSol: 100 });
  m.step(minutes * 60_000);
  return m;
}

/** A coin that is alive and trading, so orders have something to hit. */
function liveCoin(m: Market) {
  return [...m.coins.values()].find((c) => !c.dead && m.time - c.lastTradeAt < 2000)!;
}

describe("market", () => {
  it("is deterministic for a seed", () => {
    const a = runningMarket(5, 3);
    const b = runningMarket(5, 3);
    expect([...a.coins.keys()]).toEqual([...b.coins.keys()]);
    const ca = [...a.coins.values()].at(-1)!;
    const cb = b.coins.get(ca.id)!;
    expect(cb.r).toEqual(ca.r);
  });

  it("conserves tokens: holders always own exactly what was sold off the curve", () => {
    const m = runningMarket(2, 10);
    for (const c of m.coins.values()) {
      if (c.r.phase !== "curve") continue;
      const held = [...c.holders.values()].reduce((s, b) => s + b, 0);
      // holders under 1 token are dropped as dust
      expect(Math.abs(held - c.r.tokensSold)).toBeLessThan(c.holders.size + 2);
    }
  });

  it("dumps every insider bag when a coin rugs", () => {
    const m = runningMarket(3, 8);
    const rugged = [...m.coins.values()].filter(
      (c) => c.plan.rugAt !== undefined && (m.time - c.createdAt) / 1000 > c.plan.rugAt + 3,
    );
    expect(rugged.length).toBeGreaterThan(5);
    for (const c of rugged) {
      for (const [w, k] of c.kinds) if (k === "dev" || k === "bundle") expect(c.holders.get(w) ?? 0).toBe(0);
    }
  });

  it("graduates some coins within an hour", () => {
    const m = new Market({ seed: 4 });
    m.step(60 * 60_000);
    expect([...m.coins.values()].some((c) => c.r.phase === "graduated")).toBe(true);
  }, 30_000);
});

describe("player orders", () => {
  it("buys after latency and books cost including all fees", () => {
    const m = runningMarket();
    const c = liveCoin(m);
    const res = m.submit({ coinId: c.id, side: "buy", amount: 1, slippagePct: 50, priorityFeeSol: 0.001 });
    expect(res.ok).toBe(true);
    expect(m.sol).toBeCloseTo(100 - 1.001, 9); // held while pending
    expect(m.positions.has(c.id)).toBe(false);
    m.step(2000);
    const pos = m.positions.get(c.id)!;
    expect(pos.tokens).toBeGreaterThan(0);
    expect(pos.costSol).toBeCloseTo(1.001, 9);
    expect(c.holders.get("you")).toBeCloseTo(pos.tokens, 3);
    const h = m.history.at(-1)!;
    expect(h.status).toBe("ok");
    expect(h.fee).toBeGreaterThanOrEqual(PLATFORM_FEE * 1);
  });

  it("sells everything and realizes PnL = proceeds - cost - fees", () => {
    const m = runningMarket();
    const c = liveCoin(m);
    m.submit({ coinId: c.id, side: "buy", amount: 1, slippagePct: 50, priorityFeeSol: 0.001 });
    m.step(2000);
    const pos = m.positions.get(c.id)!;
    const solBefore = m.sol;
    m.submit({ coinId: c.id, side: "sell", amount: pos.tokens, slippagePct: 90, priorityFeeSol: 0.001 });
    m.step(2000);
    const sell = m.history.at(-1)!;
    expect(sell.status).toBe("ok");
    expect(pos.tokens).toBe(0);
    expect(m.sol).toBeCloseTo(solBefore - 0.001 + sell.sol, 9);
    expect(pos.realizedSol).toBeCloseTo(sell.sol - 1.001 - 0.001, 9);
    // the sell carries its own PnL, and closes the position
    expect(sell.pnlSol).toBeCloseTo(pos.realizedSol, 9);
    expect(sell.pnlPct).toBeCloseTo((pos.realizedSol / 1.001) * 100, 6);
    expect(sell.soldPct).toBeCloseTo(100, 9);
    expect(sell.positionPnlSol).toBeCloseTo(pos.realizedSol, 9);
    expect(m.equity()).toBeCloseTo(100 + pos.realizedSol, 9);
  });

  it("rejects orders you can't afford", () => {
    const m = runningMarket();
    const c = liveCoin(m);
    expect(m.submit({ coinId: c.id, side: "buy", amount: 500, slippagePct: 10, priorityFeeSol: 0 }).ok).toBe(false);
    expect(m.submit({ coinId: c.id, side: "sell", amount: 1, slippagePct: 10, priorityFeeSol: 0 }).ok).toBe(false);
    expect(m.sol).toBe(100);
  });

  it("fails on slippage, refunds the SOL but keeps the priority fee", () => {
    const m = runningMarket();
    const c = liveCoin(m);
    // Two buys quoted at the same price: whichever lands second gets a worse price.
    m.submit({ coinId: c.id, side: "buy", amount: 5, slippagePct: 0, priorityFeeSol: 0.001 });
    m.submit({ coinId: c.id, side: "buy", amount: 5, slippagePct: 0, priorityFeeSol: 0.001 });
    m.step(3000);
    const failed = m.history.filter((h) => h.status === "failed");
    expect(failed.length).toBeGreaterThanOrEqual(1);
    expect(failed[0].reason).toBe("Slippage exceeded");
    const filled = m.history.filter((h) => h.status === "ok").reduce((s, h) => s + h.sol, 0);
    expect(m.sol).toBeCloseTo(100 - filled - 0.002, 6);
  });
});
