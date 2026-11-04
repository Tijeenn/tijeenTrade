import { bondingProgress, mcapUsd, TOTAL_SUPPLY } from "./curve";
import type { Coin } from "./market";

/** Everything a trader can actually see about a coin (no hidden plan). */
export interface CoinStats {
  mcapUsd: number;
  athMcapUsd: number;
  ageSec: number;
  progress: number; // bonding curve 0..1
  holders: number;
  devPct: number;
  bundlePct: number;
  sniperPct: number;
  top10Pct: number;
  devSold: boolean;
  volumeSol: number;
  buys: number;
  sells: number;
  graduated: boolean;
  // the dev's record on their OTHER coins (unknown dev = all zero)
  devPrevCoins: number;
  devPrevRugs: number;
  devPrevMigrations: number;
}

export function coinStats(c: Coin, now: number): CoinStats {
  let dev = 0, bundle = 0, sniper = 0;
  const bals: number[] = [];
  for (const [w, b] of c.holders) {
    const k = c.kinds.get(w);
    if (k === "dev") dev += b;
    else if (k === "bundle") bundle += b;
    else if (k === "sniper") sniper += b;
    bals.push(b);
  }
  bals.sort((a, b) => b - a);
  const top10 = bals.slice(0, 10).reduce((s, b) => s + b, 0);
  const pct = (x: number) => (x / TOTAL_SUPPLY) * 100;
  return {
    mcapUsd: mcapUsd(c.r),
    athMcapUsd: c.athMcap,
    ageSec: (now - c.createdAt) / 1000,
    progress: bondingProgress(c.r),
    holders: c.holders.size,
    devPct: pct(dev),
    bundlePct: pct(bundle),
    sniperPct: pct(sniper),
    top10Pct: pct(top10),
    devSold: c.devSold,
    volumeSol: c.volumeSol,
    buys: c.buys,
    sells: c.sells,
    graduated: c.r.phase === "graduated",
    devPrevCoins: c.devProfile ? c.devProfile.created - 1 : 0,
    devPrevRugs: c.devProfile ? c.devProfile.rugged - (c.rugCounted ? 1 : 0) : 0,
    devPrevMigrations: c.devProfile ? c.devProfile.migrated - (c.r.phase === "graduated" ? 1 : 0) : 0,
  };
}
