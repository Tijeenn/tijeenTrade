/**
 * Monte Carlo check of the market: outcome distribution + how simple strategies do.
 * Run: npx tsx scripts/simulate.ts [hours] [seed]
 */
import { Market, type Coin } from "../src/lib/sim/market";
import { coinStats } from "../src/lib/sim/stats";

const hours = Number(process.argv[2] ?? 3);
const seed = Number(process.argv[3] ?? 42);
const STEP = 500;
const END = hours * 3600_000;

function maxDropWithin(c: Coin, sec: number): number {
  let worst = 0;
  const cs = c.candles;
  for (let i = 0; i < cs.length; i++) {
    for (let j = i; j < cs.length && cs[j].t - cs[i].t <= sec; j++) worst = Math.max(worst, 1 - cs[j].l / cs[i].h);
  }
  return worst;
}

interface Summary { arch: string; start: number; ath: number; graduated: boolean; drop10s: number; life: number }

/** Summarize dead coins and drop them so a multi-hour run fits in memory. */
function harvest(m: Market, out: Summary[], keep: (c: Coin) => boolean = () => false) {
  for (const c of m.coins.values()) {
    if (!c.dead || keep(c)) continue;
    out.push({
      arch: c.plan.archetype, start: c.startMcap, ath: c.athMcap, graduated: c.graduatedAt !== undefined,
      drop10s: maxDropWithin(c, 10), life: (c.lastTradeAt - c.createdAt) / 1000,
    });
    m.coins.delete(c.id);
  }
}

// ---------- 1. outcomes ----------
{
  const m = new Market({ seed, maxCoins: 1e9 });
  const t0 = Date.now();
  const coins: Summary[] = [];
  while (m.time < END) {
    m.step(STEP);
    if (m.time % 60_000 === 0) harvest(m, coins);
  }
  harvest(m, coins);
  const n = coins.length;
  const pct = (k: number) => ((k / n) * 100).toFixed(1) + "%";
  const ath = coins.map((c) => c.ath / c.start);
  const athUsd = coins.map((c) => c.ath);
  console.log(`\n=== ${hours}h simulated in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${n} finished coins (${m.coins.size} still alive) ===`);
  console.log("Peak mcap (ATH):");
  for (const [lo, hi] of [[0, 10e3], [10e3, 30e3], [30e3, 61e3], [61e3, 250e3], [250e3, 1e6], [1e6, Infinity]])
    console.log(`  $${lo / 1e3}k–${hi === Infinity ? "∞" : "$" + hi / 1e3 + "k"}: ${pct(athUsd.filter((x) => x >= lo && x < hi).length)}`);
  console.log("Peak multiple vs launch mcap:");
  for (const x of [1.5, 2, 5, 10, 50, 100]) console.log(`  ≥${x}x: ${pct(ath.filter((a) => a >= x).length)}`);
  console.log(`Graduated: ${pct(coins.filter((c) => c.graduated).length)}  (+ ${[...m.coins.values()].filter((c) => c.graduatedAt !== undefined).length} graduated coins still alive)`);
  console.log(`Crashed within 10s at some point: ≥50% ${pct(coins.filter((c) => c.drop10s >= 0.5).length)}, ≥70% ${pct(coins.filter((c) => c.drop10s >= 0.7).length)}`);
  const life = coins.map((c) => c.life).sort((a, b) => a - b);
  console.log(`Active lifetime median: ${life[Math.floor(n / 2)].toFixed(0)}s, p90: ${life[Math.floor(n * 0.9)].toFixed(0)}s`);
  const byArch: Record<string, number> = {};
  for (const c of coins) byArch[c.arch] = (byArch[c.arch] ?? 0) + 1;
  console.log("Hidden archetypes:", Object.fromEntries(Object.entries(byArch).map(([k, v]) => [k, pct(v)])));
}

// ---------- 2. strategies (through the real order path: fees, latency, slippage) ----------
interface Strategy {
  name: string;
  enter: (c: Coin, m: Market) => boolean;
  exit: (mult: number, heldSec: number, c: Coin) => boolean;
}

const strategies: Strategy[] = [
  {
    name: "Random ape (buy 15% of new coins at ~2s, sell after 10–180s)",
    enter: (c, m) => {
      const age = (m.time - c.createdAt) / 1000;
      return age >= 2 && age < 2.5 && m.rng.chance(0.15);
    },
    exit: (_mult, held, c) => held > 10 + (c.createdAt % 170),
  },
  {
    name: "Careful (dev/bundles/socials/momentum filter at 20s, TP 2x, SL -30%)",
    enter: (c, m) => {
      const s = coinStats(c, m.time);
      if (s.ageSec < 20 || s.ageSec >= 20.5) return false;
      return (
        s.devPct < 5 && s.bundlePct < 5 && !s.devSold && c.plan.socials.x &&
        s.mcapUsd > c.startMcap * 1.3 && s.buys > s.sells * 1.3 && s.top10Pct < 35
      );
    },
    exit: (mult, held) => mult >= 2 || mult <= 0.7 || held > 600,
  },
];

const BET = 0.5;
for (const st of strategies) {
  const m = new Market({ seed, startSol: 1000, maxCoins: 1e9 });
  const open = new Map<string, number>(); // coinId -> entry time
  const entered = new Set<string>();
  const sink: Summary[] = [];
  while (m.time < END) {
    m.step(STEP);
    if (m.time % 60_000 === 0) {
      harvest(m, sink, (c) => m.positions.has(c.id));
      sink.length = 0;
    }
    for (const c of m.coins.values()) {
      if (c.dead || entered.has(c.id) || !st.enter(c, m)) continue;
      entered.add(c.id);
      if (m.submit({ coinId: c.id, side: "buy", amount: BET, slippagePct: 20, priorityFeeSol: 0.001 }).ok)
        open.set(c.id, m.time);
    }
    for (const [id, since] of open) {
      const pos = m.positions.get(id);
      if (!pos) {
        if (m.time - since > 5000) open.delete(id); // buy failed
        continue;
      }
      if (pos.tokens <= 0) continue;
      const mult = m.positionValue(id) / pos.costSol;
      if (st.exit(mult, (m.time - since) / 1000, m.coins.get(id)!)) {
        m.submit({ coinId: id, side: "sell", amount: pos.tokens, slippagePct: 50, priorityFeeSol: 0.001 });
        open.delete(id);
      }
    }
  }
  const closed = [...m.positions.values()].filter((p) => p.tokens === 0 && p.boughtSol > 0);
  const pnl = closed.map((p) => p.realizedSol);
  const wins = pnl.filter((x) => x > 0).length;
  const total = pnl.reduce((s, x) => s + x, 0);
  const failed = m.history.filter((h) => h.status === "failed").length;
  console.log(`\n--- ${st.name} ---`);
  console.log(`  trades: ${closed.length}, win rate: ${((wins / closed.length) * 100).toFixed(1)}%, failed tx: ${failed}`);
  console.log(`  total PnL: ${total.toFixed(2)} SOL on ${(closed.length * BET).toFixed(1)} SOL risked → ROI per trade ${((total / (closed.length * BET)) * 100).toFixed(1)}%`);
  console.log(`  best trade: ${Math.max(...pnl).toFixed(2)} SOL, worst: ${Math.min(...pnl).toFixed(2)} SOL`);
}
