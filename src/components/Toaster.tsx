"use client";

import { useEffect, useState } from "react";
import { sol, tokens } from "@/lib/format";
import type { UserTrade } from "@/lib/sim/market";
import { getMarket } from "@/lib/store";

interface Toast {
  key: number;
  trade: UserTrade;
}

/** Pops a notification whenever one of your orders lands or fails. */
export function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const m = getMarket();
    let seen = m.history.length;
    const id = setInterval(() => {
      if (m.history.length <= seen) return;
      const fresh = m.history.slice(seen);
      seen = m.history.length;
      setToasts((t) => [...t, ...fresh.map((trade) => ({ key: trade.id, trade }))].slice(-4));
      for (const f of fresh) setTimeout(() => setToasts((t) => t.filter((x) => x.key !== f.id)), 3500);
    }, 150);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-72 flex-col gap-2">
      {toasts.map(({ key, trade: t }) => (
        <div
          key={key}
          className={`toast-in num rounded-md border bg-panel-2 px-3 py-2 text-sm shadow-lg ${
            t.status === "failed" ? "border-down/50" : t.side === "buy" ? "border-up/40" : "border-down/40"
          }`}
        >
          {t.status === "failed" ? (
            <>
              <div className="font-medium text-down">Transaction failed · ${t.ticker}</div>
              <div className="text-xs text-muted">{t.reason} (priority fee spent)</div>
            </>
          ) : (
            <>
              <div className={`font-medium ${t.side === "buy" ? "text-up" : "text-down"}`}>
                {t.side === "buy" ? "Bought" : "Sold"} {tokens(t.tokens)} ${t.ticker}
              </div>
              <div className="text-xs text-muted">
                {t.side === "buy" ? "for" : "for"} {sol(t.sol)} SOL · fees {sol(t.fee + t.priorityFee, 4)}
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
