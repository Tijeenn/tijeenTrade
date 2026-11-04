"use client";

import { useEffect, useState } from "react";
import { mc, pct, signed, sol, tokens } from "@/lib/format";
import type { UserTrade } from "@/lib/sim/market";
import { getMarket } from "@/lib/store";
import { Sol } from "./Sol";

const MAX_TOASTS = 4;
const DURATION = { buy: 3500, sell: 7000, failed: 4500 };

const pnlText = (sol_: number, pct_: number) => (
  <>
    {signed(sol_, (x) => sol(x))} <span className="text-[0.7em] font-semibold">({signed(pct_, (x) => pct(x, 1))})</span>
  </>
);

/** A fun label for big moves, like the PnL flex cards on real terminals. */
function badge(pnlPct: number): string | null {
  if (pnlPct >= 300) return "🚀 MOONSHOT";
  if (pnlPct >= 100) return "🔥 BIG WIN";
  if (pnlPct <= -70) return "💀 REKT";
  return null;
}

function SellToast({ t }: { t: UserTrade }) {
  const pnl = t.pnlSol ?? 0;
  const win = pnl >= 0;
  const closed = t.positionPnlSol !== undefined;
  const headline = closed ? t.positionPnlPct! : t.pnlPct ?? 0;
  const tag = badge(headline);
  return (
    <div
      className={`rounded-lg border-2 bg-panel-2 px-4 py-3 shadow-2xl ${
        win ? "border-up/60 shadow-up/10" : "border-down/60 shadow-down/10"
      }`}
    >
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-muted">
          Sold {t.soldPct !== undefined && t.soldPct < 99.9 ? `${pct(t.soldPct)} of ` : ""}${t.ticker}
        </span>
        {tag && <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${win ? "bg-up/20 text-up" : "bg-down/20 text-down"}`}>{tag}</span>}
      </div>
      <Sol size={18} className={`mt-1 text-2xl font-bold ${win ? "text-up" : "text-down"}`}>
        {pnlText(pnl, t.pnlPct ?? 0)}
      </Sol>
      <div className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted">
        <span>Received <Sol size={10}>{sol(t.sol)}</Sol></span>
        <span>at MC <Sol size={10}>{mc(t.mcapUsd)}</Sol></span>
        <span>fees <Sol size={10}>{sol(t.fee + t.priorityFee, 4)}</Sol></span>
      </div>
      {closed && (
        <div className={`mt-2 border-t pt-2 text-xs ${win ? "border-up/20" : "border-down/20"}`}>
          <span className="text-muted">Trade closed · total </span>
          <Sol size={10} className={`font-bold ${t.positionPnlSol! >= 0 ? "text-up" : "text-down"}`}>
            {pnlText(t.positionPnlSol!, t.positionPnlPct!)}
          </Sol>
        </div>
      )}
    </div>
  );
}

function BuyToast({ t }: { t: UserTrade }) {
  return (
    <div className="rounded-lg border border-up/40 bg-panel-2 px-3 py-2 text-sm shadow-xl">
      <div className="font-medium text-up">Bought {tokens(t.tokens)} ${t.ticker}</div>
      <div className="flex flex-wrap gap-x-2 text-xs text-muted">
        <span>for <Sol size={10}>{sol(t.sol)}</Sol></span>
        <span>at MC <Sol size={10}>{mc(t.mcapUsd)}</Sol></span>
        <span>fees <Sol size={10}>{sol(t.fee + t.priorityFee, 4)}</Sol></span>
      </div>
    </div>
  );
}

function FailedToast({ t }: { t: UserTrade }) {
  return (
    <div className="rounded-lg border border-down/50 bg-panel-2 px-3 py-2 text-sm shadow-xl">
      <div className="font-medium text-down">
        {t.side === "buy" ? "Buy" : "Sell"} failed · ${t.ticker}
      </div>
      <div className="text-xs text-muted">
        {t.reason}. Priority fee spent: <Sol size={10}>{sol(t.priorityFee, 4)}</Sol>
      </div>
    </div>
  );
}

/** Pops a notification whenever one of your orders lands or fails. Click to dismiss. */
export function Toaster() {
  const [toasts, setToasts] = useState<UserTrade[]>([]);

  useEffect(() => {
    const m = getMarket();
    let seen = m.history.length;
    const id = setInterval(() => {
      if (m.history.length <= seen) return;
      const fresh = m.history.slice(seen);
      seen = m.history.length;
      setToasts((t) => [...t, ...fresh].slice(-MAX_TOASTS));
      for (const f of fresh) {
        const ms = f.status === "failed" ? DURATION.failed : DURATION[f.side];
        setTimeout(() => setToasts((t) => t.filter((x) => x.id !== f.id)), ms);
      }
    }, 150);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-[min(20rem,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((t) => (
        <button
          key={t.id}
          onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}
          className="toast-in num block w-full text-left"
          title="Click to dismiss"
        >
          {t.status === "failed" ? <FailedToast t={t} /> : t.side === "sell" ? <SellToast t={t} /> : <BuyToast t={t} />}
        </button>
      ))}
    </div>
  );
}
