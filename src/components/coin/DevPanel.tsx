"use client";

import { useState } from "react";
import { Sol } from "@/components/Sol";
import { age, pct, signed, sol } from "@/lib/format";
import { TOTAL_SUPPLY } from "@/lib/sim/curve";
import type { Coin, Market } from "@/lib/sim/market";
import { sellPct } from "@/lib/store";

/** Shown on coins you launched: your dev bag and the big red button. */
export function DevPanel({ coin, m }: { coin: Coin; m: Market }) {
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string>();
  const pos = m.positions.get(coin.id);
  const tokens = pos?.tokens ?? 0;
  const value = m.positionValue(coin.id);
  const pending = m.pending.some((o) => o.coinId === coin.id && o.side === "sell");

  const rug = () => {
    if (!confirm) return setConfirm(true);
    setConfirm(false);
    // Rugs are market dumps: accept any price.
    const res = sellPct(coin.id, 100, { slippagePct: 99 });
    setError(res.ok ? undefined : res.reason);
  };

  return (
    <div className="border-b border-line bg-brand/5 p-3 text-xs">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-brand">👑 You&apos;re the dev</span>
        {coin.ruggedAt !== undefined && (
          <span className="rounded bg-down/20 px-1.5 py-0.5 font-bold text-down">RUGGED {age(m.time - coin.ruggedAt)} ago</span>
        )}
      </div>

      {coin.ruggedAt !== undefined ? (
        <p className="text-muted">
          You pulled the rug. Holders panic-sold and the chart is dead. Total result on this coin:{" "}
          <Sol className={(pos?.realizedSol ?? 0) >= 0 ? "font-bold text-up" : "font-bold text-down"}>
            {signed(pos?.realizedSol ?? 0, (x) => sol(x))}
          </Sol>
        </p>
      ) : tokens > 0 ? (
        <>
          <div className="num mb-3 grid grid-cols-2 gap-y-1">
            <span className="text-dim">Your bag</span>
            <span className="text-right">{pct((tokens / TOTAL_SUPPLY) * 100, 1)} of supply</span>
            <span className="text-dim">Worth now</span>
            <span className="text-right"><Sol>{sol(value)}</Sol></span>
            <span className="text-dim">If you rug</span>
            <span className={`text-right ${value - (pos?.costSol ?? 0) >= 0 ? "text-up" : "text-down"}`}>
              <Sol>{signed(value - (pos?.costSol ?? 0), (x) => sol(x))}</Sol>
            </span>
          </div>
          <button
            onClick={rug}
            onMouseLeave={() => setConfirm(false)}
            disabled={pending}
            className={`w-full rounded-md py-2.5 text-sm font-bold disabled:opacity-50 ${
              confirm ? "bg-down text-bg" : "border-2 border-down text-down hover:bg-down/10"
            }`}
          >
            {pending ? "Rugging…" : confirm ? "Click again to dump everything" : "🧹 Rug pull"}
          </button>
          <p className="mt-2 leading-tight text-dim">
            Dumps your whole bag on the buyers. Everyone sees DEV SOLD and panic-sells. Selling a smaller part
            (under 50%) won&apos;t kill it, but it spooks buyers.
          </p>
        </>
      ) : (
        <p className="text-muted">You hold none of your coin. Buy some below if you want something to rug. 😈</p>
      )}
      {error && <div className="mt-1 text-down">{error}</div>}
    </div>
  );
}
