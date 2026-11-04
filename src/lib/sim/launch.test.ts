import { describe, expect, it } from "vitest";
import { mcapUsd } from "./curve";
import { CREATE_FEE_SOL, Market } from "./market";
import { coinStats } from "./stats";

const socials = { x: true, tg: true, web: false };

function launched(devBuySol = 1, seed = 21) {
  const m = new Market({ seed, startSol: 20 });
  m.step(60_000);
  const res = m.launch({ name: "Test Coin", ticker: "test", hue: 120, socials, devBuySol });
  if (!res.ok) throw new Error(res.reason);
  return { m, c: m.coins.get(res.coinId)! };
}

describe("launching your own coin", () => {
  it("charges the creation fee + dev buy and makes you the dev", () => {
    const { m, c } = launched(1);
    expect(c.mine).toBe(true);
    expect(c.ticker).toBe("TEST");
    expect(c.plan.rugAt).toBeUndefined();
    expect(c.plan.devSellAt).toBeUndefined();
    const pos = m.positions.get(c.id)!;
    expect(pos.tokens).toBeGreaterThan(0);
    expect(m.sol).toBeCloseTo(20 - CREATE_FEE_SOL - 1, 9);
    expect(c.kinds.get("you")).toBe("dev");
    expect(coinStats(c, m.time).devPct).toBeGreaterThan(2);
    const h = m.history.at(-1)!;
    expect(h.note).toBe("launch");
    expect(h.tokens).toBeCloseTo(pos.tokens, 6);
    m.step(30_000); // the market trades your coin
    expect(c.buys + c.sells).toBeGreaterThan(5);
  });

  it("validates input and balance", () => {
    const m = new Market({ seed: 1, startSol: 0.5 });
    expect(m.launch({ name: "", ticker: "A", hue: 0, socials, devBuySol: 0 }).ok).toBe(false);
    expect(m.launch({ name: "Ok", ticker: "BAD TICKER", hue: 0, socials, devBuySol: 0 }).ok).toBe(false);
    expect(m.launch({ name: "Ok", ticker: "OK", hue: 0, socials, devBuySol: 1 }).ok).toBe(false);
    expect(m.sol).toBe(0.5);
    expect(m.launch({ name: "Ok", ticker: "OK", hue: 0, socials, devBuySol: 0 }).ok).toBe(true);
    expect(m.sol).toBeCloseTo(0.5 - CREATE_FEE_SOL, 9);
  });

  it("rug pull: dumping your bag tags the sell and crashes the coin", () => {
    const { m, c } = launched(2, 5);
    m.step(20_000);
    const tokens = m.positions.get(c.id)!.tokens;
    m.submit({ coinId: c.id, side: "sell", amount: tokens, slippagePct: 99, priorityFeeSol: 0.001 });
    m.step(2000);
    const rug = m.history.at(-1)!;
    expect(rug.status).toBe("ok");
    expect(rug.note).toBe("rug");
    expect(c.ruggedAt).toBeDefined();
    expect(c.devSold).toBe(true);
    const afterRug = mcapUsd(c.r);
    m.step(30_000); // panic: holders dump
    expect(mcapUsd(c.r)).toBeLessThan(afterRug);
    const recent = c.trades.filter((t) => t.t > c.ruggedAt!);
    expect(recent.filter((t) => t.side === "sell").length).toBeGreaterThan(recent.filter((t) => t.side === "buy").length);
  });

  it("a small dev sell is not a rug", () => {
    const { m, c } = launched(2, 6);
    m.step(5000);
    const tokens = m.positions.get(c.id)!.tokens;
    m.submit({ coinId: c.id, side: "sell", amount: tokens * 0.2, slippagePct: 99, priorityFeeSol: 0 });
    m.step(2000);
    expect(m.history.at(-1)!.note).toBeUndefined();
    expect(c.ruggedAt).toBeUndefined();
    expect(c.devSold).toBe(true);
  });
});
