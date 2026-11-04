"use client";

import { useState } from "react";
import type { Coin, Market } from "@/lib/sim/market";
import { bondingProgress } from "@/lib/sim/curve";
import { useMarket } from "@/lib/store";
import { CoinCard } from "./CoinCard";

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

function Column({ def, m }: { def: ColumnDef; m: Market }) {
  // While hovered, keep the order you were looking at so cards don't jump under the cursor.
  const [frozen, setFrozen] = useState<string[] | null>(null);
  const paused = frozen !== null;
  const coins = paused
    ? frozen.map((id) => m.coins.get(id)).filter((c): c is Coin => !!c)
    : def.select(m).slice(0, LIMIT);
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
  return (
    <div className="flex h-[calc(100dvh-3.5rem)] flex-col">
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
            <Column def={c} m={m} />
          </div>
        ))}
      </div>
    </div>
  );
}
