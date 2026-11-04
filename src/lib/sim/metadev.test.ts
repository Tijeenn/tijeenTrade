import { describe, expect, it } from "vitest";
import { mcapUsd } from "./curve";
import { Market } from "./market";
import { coinStats } from "./stats";

describe("dev reputation", () => {
  it("serial ruggers come back, and their record shows it", () => {
    const m = new Market({ seed: 12, maxCoins: 1e9 });
    m.step(40 * 60_000);
    const ruggers = [...m.devs.values()].filter((d) => d.type === "rugger" && d.created >= 3);
    expect(ruggers.length).toBeGreaterThan(3);
    expect(ruggers.some((d) => d.rugged >= 2)).toBe(true);

    // a fresh launch from a known rugger shows the history; the coin's own rug isn't counted yet
    const coins = [...m.coins.values()].filter((c) => c.devProfile && c.devProfile.rugged >= 2 && !c.rugCounted);
    for (const c of coins) {
      const s = coinStats(c, m.time);
      expect(s.devPrevRugs).toBe(c.devProfile!.rugged);
      expect(s.devPrevCoins).toBe(c.devProfile!.created - 1);
    }
  }, 30_000);

  it("builders' coins are the ones with migrations on record", () => {
    const m = new Market({ seed: 13, maxCoins: 1e9 });
    m.step(60 * 60_000);
    const migrated = [...m.devs.values()].filter((d) => d.migrated > 0);
    expect(migrated.length).toBeGreaterThan(0);
    expect(migrated.every((d) => d.type === "builder")).toBe(true);
  }, 30_000);
});

describe("metas", () => {
  it("rotates themes, floods launches with copycats and pumps in-meta coins", () => {
    const m = new Market({ seed: 14, maxCoins: 1e9 });
    const seen = new Set<string>();
    let inMeta = 0;
    let launchedDuringMeta = 0;
    let known = new Set(m.coins.keys());
    for (let t = 0; t < 60 * 60; t += 5) {
      m.step(5000);
      if (m.meta) seen.add(m.meta.word);
      for (const c of m.coins.values()) {
        if (known.has(c.id)) continue;
        if (m.meta) {
          launchedDuringMeta++;
          if (c.themes.includes(m.meta.word)) inMeta++;
        }
      }
      known = new Set(m.coins.keys());
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
    // ~35% copycats plus coins that match by chance
    expect(inMeta / launchedDuringMeta).toBeGreaterThan(0.3);
  }, 30_000);

  it("coins launched into their meta peak higher than other launches at the same time", () => {
    const m = new Market({ seed: 15, maxCoins: 1e9 });
    const metaOf = new Map<string, boolean>(); // coinId -> launched in its own meta?
    for (let t = 0; t < 90 * 60; t += 2) {
      m.step(2000);
      for (const c of m.coins.values()) {
        if (!metaOf.has(c.id) && m.meta) metaOf.set(c.id, c.themes.includes(m.meta.word));
      }
    }
    const peak = (inMeta: boolean) => {
      const xs = [...metaOf].filter(([, v]) => v === inMeta).map(([id]) => {
        const c = m.coins.get(id)!;
        return mcapUsd(c.r) > 0 ? Math.log(c.athMcap / c.startMcap) : 0;
      });
      return xs.reduce((a, x) => a + x, 0) / xs.length;
    };
    expect([...metaOf.values()].filter(Boolean).length).toBeGreaterThan(50);
    expect(peak(true)).toBeGreaterThan(peak(false) + 0.1);
  }, 60_000);
});
