"use client";

import { useState } from "react";
import { BOT_LABEL } from "@/lib/sim/bots";
import type { Coin, Market } from "@/lib/sim/market";
import { getBots } from "@/lib/store";

const PRESETS = [
  { label: "2x / -30%", tp: 100, sl: 30 },
  { label: "+50% / -20%", tp: 50, sl: 20 },
  { label: "5x / -50%", tp: 400, sl: 50 },
];

/** Take profit / stop loss on a position you hold (Axiom-style). Runs while the tab is open. */
export function AutoSell({ coin, m }: { coin: Coin; m: Market }) {
  const bots = getBots();
  const rule = bots.managed.get(coin.id);
  const [tp, setTp] = useState(rule?.exit.takeProfitPct?.toString() ?? "");
  const [sl, setSl] = useState(rule?.exit.stopLossPct?.toString() ?? "");
  const holding = (m.positions.get(coin.id)?.tokens ?? 0) > 0;
  if (!holding) return null;

  const num = (s: string) => (s.trim() === "" ? null : Number(s));
  const valid = [tp, sl].every((s) => s.trim() === "" || (Number.isFinite(Number(s)) && Number(s) > 0));
  const active = rule && (rule.exit.takeProfitPct !== null || rule.exit.stopLossPct !== null);

  const apply = (t: string, s: string) => {
    bots.setExit(m, coin.id, { takeProfitPct: num(t), stopLossPct: num(s), maxHoldSec: rule?.exit.maxHoldSec ?? null });
  };

  return (
    <div className="border-b border-line p-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-muted">Auto-sell</span>
        {active ? (
          <span className="text-up">
            ● {rule.bot === "manual" ? "Active" : `Set by ${BOT_LABEL[rule.bot]}`}
            {rule.exit.takeProfitPct !== null && ` · TP +${rule.exit.takeProfitPct}%`}
            {rule.exit.stopLossPct !== null && ` · SL -${rule.exit.stopLossPct}%`}
          </span>
        ) : (
          <span className="text-dim">Off</span>
        )}
      </div>
      <div className="mb-2 flex gap-1">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => {
              setTp(String(p.tp));
              setSl(String(p.sl));
              apply(String(p.tp), String(p.sl));
            }}
            className="flex-1 rounded border border-line-2 py-1 text-muted hover:border-brand hover:text-text"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1">
        <label className="flex flex-1 items-center gap-1 rounded border border-line-2 bg-bg px-2 py-1">
          <span className="text-up">TP +</span>
          <input inputMode="decimal" value={tp} onChange={(e) => setTp(e.target.value)} placeholder="off"
            className="num w-full min-w-0 bg-transparent text-right outline-none placeholder:text-dim" />
          <span className="text-dim">%</span>
        </label>
        <label className="flex flex-1 items-center gap-1 rounded border border-line-2 bg-bg px-2 py-1">
          <span className="text-down">SL -</span>
          <input inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value)} placeholder="off"
            className="num w-full min-w-0 bg-transparent text-right outline-none placeholder:text-dim" />
          <span className="text-dim">%</span>
        </label>
        <button
          disabled={!valid}
          onClick={() => apply(tp, sl)}
          className="rounded bg-brand px-3 font-semibold text-white disabled:opacity-40"
        >
          Set
        </button>
      </div>
      {active && (
        <button
          onClick={() => {
            setTp("");
            setSl("");
            bots.setExit(m, coin.id, null);
          }}
          className="mt-1.5 text-dim underline hover:text-text"
        >
          Cancel auto-sell
        </button>
      )}
    </div>
  );
}
