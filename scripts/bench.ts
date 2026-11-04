/** Speed check: simulated time vs wall time. Run: npx tsx scripts/bench.ts [minutes] */
import { Market } from "../src/lib/sim/market";

const minutes = Number(process.argv[2] ?? 20);
const m = new Market({ seed: 1 });
let trades = 0;
const t0 = performance.now();
let lastReport = 0;
while (m.time < minutes * 60_000) {
  m.step(500);
  if (m.time - lastReport >= 5 * 60_000) {
    lastReport = m.time;
    let alive = 0, holders = 0, kinds = 0;
    for (const c of m.coins.values()) {
      kinds += c.kinds.size;
      if (!c.dead) { alive++; holders += c.holders.size; }
    }
    const wall = (performance.now() - t0) / 1000;
    const heap = (process.memoryUsage().heapUsed / 1e6).toFixed(0);
    console.log(`sim ${m.time / 60000}min | wall ${wall.toFixed(1)}s | coins ${m.coins.size} alive ${alive} | holders(alive) ${holders} | labels ${kinds} | heap ${heap}MB`);
  }
}
for (const c of m.coins.values()) trades += c.buys + c.sells;
const wall = (performance.now() - t0) / 1000;
console.log(`total trades ${trades} (${(trades / (minutes * 60)).toFixed(0)}/sim-sec), speed ${((minutes * 60) / wall).toFixed(0)}x realtime`);
