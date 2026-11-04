import { describe, expect, it } from "vitest";
import { Market } from "./market";
import { restore, snapshot, type MarketSave } from "./persist";

describe("save / load", () => {
  it("restores your wallet and held coins into a fresh market", () => {
    const a = new Market({ seed: 11, startSol: 50 });
    a.step(120_000);
    const live = [...a.coins.values()].filter((c) => !c.dead && a.time - c.lastTradeAt < 2000).slice(0, 2);
    for (const c of live) a.submit({ coinId: c.id, side: "buy", amount: 1, slippagePct: 50, priorityFeeSol: 0.001 });
    a.step(2000);
    // one more order still in flight at save time
    a.submit({ coinId: live[0].id, side: "buy", amount: 2, slippagePct: 50, priorityFeeSol: 0 });

    const save: MarketSave = JSON.parse(JSON.stringify(snapshot(a)));
    expect(save.coins.map((c) => c.id).sort()).toEqual(live.map((c) => c.id).sort());

    const b = new Market({ seed: 99, startSol: 10 });
    b.step(15 * 60_000);
    restore(b, save);

    expect(b.startSol).toBe(50);
    expect(b.sol).toBeCloseTo(a.sol + 2, 9); // in-flight buy refunded
    for (const c of live) {
      const rc = b.coins.get(c.id)!;
      expect(rc.r).toEqual(c.r);
      expect(rc.holders.get("you")).toBeCloseTo(a.positions.get(c.id)!.tokens, 6);
      expect(b.positionValue(c.id)).toBeCloseTo(a.positionValue(c.id), 9);
      expect(b.time - rc.createdAt).toBeGreaterThanOrEqual(a.time - c.createdAt);
      expect(b.time - rc.createdAt).toBeLessThan(a.time - c.createdAt + 60_000);
    }

    // trading continues normally after a load
    const id = live[0].id;
    const tokens = b.positions.get(id)!.tokens;
    const res = b.submit({ coinId: id, side: "sell", amount: tokens, slippagePct: 90, priorityFeeSol: 0 });
    expect(res.ok).toBe(true);
    b.step(2000);
    expect(b.positions.get(id)!.tokens).toBe(0);
    expect(b.history.at(-1)!.id).toBeGreaterThan(Math.max(...save.history.map((h) => h.id)));
    b.step(60_000); // restored coins keep simulating without errors
  });
});
