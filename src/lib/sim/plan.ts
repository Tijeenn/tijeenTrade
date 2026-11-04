import type { Rng } from "./rng";

/**
 * Hidden fate of a coin. The player never sees this directly, only its side effects
 * (dev/bundle holdings, socials, trade flow), just like a real trader.
 */
export type Archetype = "dud" | "rug" | "pumpdump" | "runner" | "moon";

export const ARCHETYPE_ODDS: Record<Archetype, number> = {
  dud: 0.62,
  rug: 0.2,
  pumpdump: 0.13,
  runner: 0.042,
  moon: 0.008,
};

export interface Plan {
  archetype: Archetype;
  peakMcapUsd: number; // where the order flow is steered towards
  peakAt: number; // seconds after launch
  shape: number; // <1 fast early pump, >1 slow start then vertical
  decayTo: number; // fraction of peak the coin bleeds to
  decayDur: number; // seconds of bleeding after the peak
  baseRate: number; // trades per second at launch
  rugAt?: number; // seconds after launch: dev + bundles dump everything
  devSellAt?: number;
  devSellFrac?: number;
  devSol: number; // dev buy at creation
  bundleWallets: number;
  bundleSol: number;
  snipers: number;
  kolAt?: number;
  socials: { x: boolean; tg: boolean; web: boolean };
}

const between = (rng: Rng, a: number, b: number) => rng.range(a, b);
const logBetween = (rng: Rng, a: number, b: number) =>
  Math.exp(rng.range(Math.log(a), Math.log(b)));

export function makePlan(rng: Rng): Plan {
  const archetype = rng.weighted(ARCHETYPE_ODDS);
  const socialChance = { dud: 0.35, rug: 0.45, pumpdump: 0.6, runner: 0.8, moon: 0.9 }[archetype];
  const socials = {
    x: rng.chance(socialChance),
    tg: rng.chance(socialChance * 0.7),
    web: rng.chance(socialChance * 0.6),
  };

  // Bundles: almost always on rugs, but also on plenty of legit coins (noisy signal).
  const bundled = archetype === "rug" || rng.chance(0.25);
  const bundleWallets = bundled ? rng.int(archetype === "rug" ? 4 : 2, archetype === "rug" ? 16 : 6) : 0;
  const bundleSol = bundled ? (archetype === "rug" ? between(rng, 4, 25) : between(rng, 1, 6)) : 0;
  const devSol =
    archetype === "rug" ? between(rng, 0.5, 4) : rng.chance(0.4) ? 0 : logBetween(rng, 0.1, 2.5);

  const base = {
    archetype,
    socials,
    devSol,
    bundleWallets,
    bundleSol,
    snipers: rng.int(2, 14),
    shape: between(rng, 0.6, 1.6),
  };

  switch (archetype) {
    case "dud": {
      // Peaks within seconds, then sinks back to the curve floor (~$4.3k).
      const peakMcapUsd = between(rng, 4300, 7500);
      return {
        ...base,
        peakMcapUsd,
        peakAt: between(rng, 2, 25),
        decayTo: between(rng, 4300, 5000) / peakMcapUsd,
        decayDur: between(rng, 20, 120),
        baseRate: between(rng, 0.3, 1.5),
        devSellAt: rng.chance(0.5) ? between(rng, 3, 60) : undefined,
        devSellFrac: 1,
      };
    }
    case "rug": {
      const peakAt = between(rng, 10, 180);
      return {
        ...base,
        peakMcapUsd: between(rng, 6000, 20000),
        peakAt,
        decayTo: 0.6,
        decayDur: 120,
        baseRate: between(rng, 1, 4),
        rugAt: peakAt * between(rng, 0.8, 1.15),
        kolAt: rng.chance(0.15) ? peakAt * between(rng, 0.3, 0.8) : undefined,
      };
    }
    case "pumpdump":
      return {
        ...base,
        peakMcapUsd: logBetween(rng, 8000, 55000),
        peakAt: between(rng, 20, 300),
        decayTo: between(rng, 0.1, 0.45),
        decayDur: between(rng, 60, 600),
        baseRate: between(rng, 1, 4),
        devSellAt: rng.chance(0.6) ? between(rng, 10, 200) : undefined,
        devSellFrac: between(rng, 0.3, 1),
        kolAt: rng.chance(0.25) ? between(rng, 10, 150) : undefined,
      };
    case "runner":
      return {
        ...base,
        peakMcapUsd: rng.logNormal(170000, 0.7) + 70000,
        peakAt: between(rng, 300, 2400),
        decayTo: between(rng, 0.15, 0.5),
        decayDur: between(rng, 900, 3600),
        baseRate: between(rng, 2, 6),
        devSellAt: rng.chance(0.3) ? between(rng, 60, 900) : undefined,
        devSellFrac: between(rng, 0.2, 0.6),
        kolAt: rng.chance(0.5) ? between(rng, 30, 600) : undefined,
      };
    case "moon":
      return {
        ...base,
        peakMcapUsd: rng.logNormal(3_000_000, 0.8) + 800000,
        peakAt: between(rng, 1200, 5400),
        decayTo: between(rng, 0.25, 0.6),
        decayDur: between(rng, 1800, 7200),
        baseRate: between(rng, 3, 8),
        kolAt: rng.chance(0.7) ? between(rng, 30, 900) : undefined,
      };
  }
}

/**
 * Target mcap multiple of the starting mcap at time t (seconds since launch),
 * before noise. Rises to the peak, then bleeds out.
 */
export function targetMcap(plan: Plan, startMcap: number, t: number): number {
  const peak = plan.peakMcapUsd;
  if (t < plan.peakAt) {
    const x = Math.pow(t / plan.peakAt, plan.shape);
    return startMcap * Math.exp(Math.log(peak / startMcap) * x);
  }
  const d = Math.min(1, (t - plan.peakAt) / plan.decayDur);
  const after = Math.max(0, t - plan.peakAt - plan.decayDur);
  return peak * Math.exp(Math.log(plan.decayTo) * d) * Math.exp(-after / 1800);
}

/** How busy the coin is (multiplier on baseRate). Volume peaks around the top. */
export function activity(plan: Plan, t: number): number {
  if (t < plan.peakAt) return 1 + 2 * (t / plan.peakAt);
  const since = t - plan.peakAt;
  return 3 * Math.exp(-since / (plan.decayDur * 0.5)) + 0.15 * Math.exp(-since / plan.decayDur);
}
