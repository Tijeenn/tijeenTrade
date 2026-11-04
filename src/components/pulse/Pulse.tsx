"use client";

import { useState } from "react";
import { usePulseFilters, useWatchlist, type PulseFilters } from "@/lib/prefs";
import { bondingProgress, mcapUsd, SOL_USD } from "@/lib/sim/curve";
import type { Coin, Market } from "@/lib/sim/market";
import { coinStats } from "@/lib/sim/stats";
import { useMarket } from "@/lib/store";
import { CoinCard } from "./CoinCard";
import { FilterBar, MetaBanner } from "./PulseBar";

/** Turn the filter bar into a test for each coin. Stats are only computed when needed. */
function filterFn(f: PulseFilters, m: Market, watch: Set<string>) {
  const q = f.search.trim().toLowerCase();
  return (c: Coin) => {
    if (q && !c.ticker.toLowerCase().includes(q) && !c.name.toLowerCase().includes(q)) return false;
    if (f.watchOnly && !watch.has(c.id)) return false;
    if (f.socials && !(c.plan.socials.x || c.plan.socials.tg || c.plan.socials.web)) return false;
    if (f.metaOnly && !(m.meta && c.themes.includes(m.meta.word))) return false;
    if (f.minMcSol > 0 && mcapUsd(c.r) / SOL_USD < f.minMcSol) return false;
    if (f.noBundles || f.cleanDev) {
      const s = coinStats(c, m.time);
      if (f.noBundles && s.bundlePct > 10) return false;
      if (f.cleanDev && s.devPrevRugs > 0) return false;
    }
    return true;
  };
}

const LIMIT = 30;
const FINAL_STRETCH = 0.4; // bonding progress where a coin moves to the middle column

interface ColumnDef {
  key: string;
  title: string;
  select: (m: Market) => Coin[];
}

const all = (m: Market) => [...m.coins.values()];

const COLUMNS: ColumnDef[] = [
  {
    key: "new",
    title: "New Pairs",
    select: (m) =>
      all(m)
        .filter((c) => c.r.phase === "curve" && bondingProgress(c.r) < FINAL_STRETCH)
        .sort((a, b) => b.createdAt - a.createdAt),
  },
  {
    key: "stretch",
    title: "Final Stretch",
    select: (m) =>
      all(m)
        .filter((c) => c.r.phase === "curve" && !c.dead && bondingProgress(c.r) >= FINAL_STRETCH)
        .sort((a, b) => bondingProgress(b.r) - bondingProgress(a.r)),
  },
  {
    key: "migrated",
    title: "Migrated",
    select: (m) =>
      all(m)
        .filter((c) => c.r.phase === "graduated")
        .sort((a, b) => (b.graduatedAt ?? 0) - (a.graduatedAt ?? 0)),
  },
];

function Column({ def, m, keep }: { def: ColumnDef; m: Market; keep: (c: Coin) => boolean }) {
  // While hovered, keep the order you were looking at so cards don't jump under the cursor.
  const [frozen, setFrozen] = useState<string[] | null>(null);
  const paused = frozen !== null;
  const coins = paused
    ? frozen.map((id) => m.coins.get(id)).filter((c): c is Coin => !!c)
    : def.select(m).filter(keep).slice(0, LIMIT);
  return (
    <section className="flex min-h-0 flex-1 flex-col border-line bg-panel lg:border-r lg:last:border-r-0">
      <div className="hidden h-10 shrink-0 items-center justify-between border-b border-line px-3 lg:flex">
        <h2 className="text-sm font-semibold">{def.title}</h2>
        {paused && <span className="text-[10px] font-medium uppercase tracking-wide text-warn">Paused</span>}
      </div>
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        onMouseEnter={() => setFrozen(coins.map((c) => c.id))}
        onMouseLeave={() => setFrozen(null)}
      >
        {coins.map((c) => (
          <CoinCard key={c.id} coin={c} m={m} />
        ))}
        {!coins.length && <p className="p-6 text-center text-sm text-dim">Nothing here yet…</p>}
      </div>
    </section>
  );
}

export function Pulse() {
  const m = useMarket(300);
  const [tab, setTab] = useState(COLUMNS[0].key);
  const f = usePulseFilters();
  const watch = useWatchlist();
  const keep = filterFn(f, m, watch);
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
      <MetaBanner m={m} />
      <FilterBar f={f} />
      <div className="flex border-b border-line lg:hidden">
        {COLUMNS.map((c) => (
          <button
            key={c.key}
            onClick={() => setTab(c.key)}
            className={`flex-1 py-2 text-sm ${tab === c.key ? "border-b-2 border-brand text-text" : "text-muted"}`}
          >
            {c.title}
          </button>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-3">
        {COLUMNS.map((c) => (
          <div key={c.key} className={`min-h-0 flex-col ${tab === c.key ? "flex" : "hidden"} lg:flex`}>
            <Column def={c} m={m} keep={keep} />
          </div>
        ))}
      </div>
    </div>
  );
}
