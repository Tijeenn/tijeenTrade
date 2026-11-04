"use client";

import Link from "next/link";
import { Sol } from "@/components/Sol";
import { age, mc } from "@/lib/format";
import { NO_FILTERS, setPulseFilters, type PulseFilters } from "@/lib/prefs";
import { mcapUsd } from "@/lib/sim/curve";
import type { Market } from "@/lib/sim/market";

/** The narrative of the moment, and the in-meta coins leading it. */
export function MetaBanner({ m }: { m: Market }) {
  if (!m.meta) {
    return (
      <div className="flex h-9 items-center gap-2 border-b border-line px-3 text-xs text-dim">
        <span>🌙 No meta right now. The next narrative is loading…</span>
      </div>
    );
  }
  const { word, until } = m.meta;
  const coins = [...m.coins.values()].filter((c) => !c.dead && c.themes.includes(word));
  const leaders = coins.sort((a, b) => mcapUsd(b.r) - mcapUsd(a.r)).slice(0, 3);
  const fading = (until - m.time) / (until - m.meta.startedAt) < 0.35;
  return (
    <div className="flex h-9 items-center gap-3 overflow-hidden border-b border-orange-500/30 bg-orange-500/10 px-3 text-xs">
      <span className="shrink-0 font-bold text-orange-400">🔥 {word.toUpperCase()} META</span>
      <span className="hidden shrink-0 text-muted sm:inline">
        {coins.length} coins · {fading ? "fading, " : ""}{age(until - m.time)} left
      </span>
      <span className="flex min-w-0 gap-2 truncate">
        {leaders.map((c) => (
          <Link key={c.id} href={`/coin/${c.id}`} className="shrink-0 rounded bg-bg/60 px-1.5 py-0.5 hover:text-brand">
            ${c.ticker} <Sol size={9}>{mc(mcapUsd(c.r))}</Sol>
          </Link>
        ))}
      </span>
    </div>
  );
}

const CHIPS: { key: keyof PulseFilters; label: string; title: string }[] = [
  { key: "watchOnly", label: "⭐ Watchlist", title: "Only coins you starred" },
  { key: "metaOnly", label: "🔥 Meta", title: "Only coins in the current meta" },
  { key: "socials", label: "Socials", title: "Has X, Telegram or a website" },
  { key: "noBundles", label: "Bundle ≤ 10%", title: "Hide heavily bundled launches" },
  { key: "cleanDev", label: "Clean dev", title: "Hide coins whose dev rugged before" },
];

export function FilterBar({ f }: { f: PulseFilters }) {
  const active = JSON.stringify(f) !== JSON.stringify(NO_FILTERS);
  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-line px-3 py-2 text-xs">
      <input
        value={f.search}
        onChange={(e) => setPulseFilters({ ...f, search: e.target.value })}
        placeholder="Search ticker or name"
        className="w-40 shrink-0 rounded-md border border-line-2 bg-bg px-2 py-1 outline-none focus:border-brand"
      />
      {CHIPS.map((c) => {
        const on = f[c.key] as boolean;
        return (
          <button
            key={c.key}
            title={c.title}
            onClick={() => setPulseFilters({ ...f, [c.key]: !on })}
            className={`shrink-0 rounded-full border px-2.5 py-1 ${on ? "border-brand bg-brand/15 text-text" : "border-line-2 text-muted hover:text-text"}`}
          >
            {c.label}
          </button>
        );
      })}
      <label className="flex shrink-0 items-center gap-1 rounded-full border border-line-2 px-2 py-0.5 text-muted" title="Minimum market cap in SOL">
        MC ≥
        <input
          inputMode="decimal"
          value={f.minMcSol || ""}
          placeholder="0"
          onChange={(e) => setPulseFilters({ ...f, minMcSol: Math.max(0, Number(e.target.value) || 0) })}
          className="num w-10 bg-transparent text-right outline-none"
        />
      </label>
      {active && (
        <button onClick={() => setPulseFilters(NO_FILTERS)} className="shrink-0 text-dim underline hover:text-text">
          Clear
        </button>
      )}
    </div>
  );
}
