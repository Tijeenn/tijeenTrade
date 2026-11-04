/**
 * How do the bots do on their default settings? Runs market + 𝕏 feed + one bot at a time.
 * Run: npx tsx scripts/bots.ts [hours] [seed]
 */
import { Bots, DEFAULT_BOTS, type BotKind } from "../src/lib/sim/bots";
import { Market } from "../src/lib/sim/market";
import { Social } from "../src/lib/sim/social";

const hours = Number(process.argv[2] ?? 2);
const seed = Number(process.argv[3] ?? 42);

for (const kind of ["sniper", "posts", "migration"] as BotKind[]) {
  const m = new Market({ seed, startSol: 1000, maxCoins: 400 });
  const s = new Social(seed);
  const cfg = structuredClone(DEFAULT_BOTS);
  cfg[kind].enabled = true;
  cfg[kind].budgetSol = 0; // unlimited, we want the per-trade picture
  const b = new Bots(cfg);
  m.step(10 * 60_000);
  b.step(m, s);
  const end = m.time + hours * 3600_000;
  while (m.time < end) {
    m.step(100);
    s.step(m);
    b.step(m, s);
  }
  const st = b.stats[kind];
  const c = cfg[kind];
  console.log(`\n--- ${kind} (buy ${c.buySol} SOL, TP ${c.exit.takeProfitPct}% / SL ${c.exit.stopLossPct}% / max ${c.exit.maxHoldSec}s) ---`);
  console.log(`  buys landed ${st.buys}, failed ${st.failed}, closed ${st.closed}, win rate ${st.closed ? ((st.wins / st.closed) * 100).toFixed(0) : 0}%`);
  console.log(`  PnL ${st.pnlSol.toFixed(2)} SOL on ${st.spentSol.toFixed(1)} SOL spent → ${((st.pnlSol / Math.max(1e-9, st.spentSol)) * 100).toFixed(1)}% per SOL`);
  console.log(`  failed tx: ${m.history.filter((h) => h.status === "failed").length}`);
}
