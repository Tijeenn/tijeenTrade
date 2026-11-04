"use client";

import { useState } from "react";
import { age, mc, pct, shortAddr, signed, sol, tokens } from "@/lib/format";
import { TOTAL_SUPPLY } from "@/lib/sim/curve";
import type { Coin, Market, WalletKind } from "@/lib/sim/market";
import { Sol } from "@/components/Sol";

const LABEL: Partial<Record<WalletKind, { text: string; cls: string }>> = {
  dev: { text: "DEV", cls: "bg-warn/15 text-warn" },
  bundle: { text: "BUNDLE", cls: "bg-down/15 text-down" },
  sniper: { text: "SNIPER", cls: "bg-orange-500/15 text-orange-400" },
  kol: { text: "KOL", cls: "bg-sky-500/15 text-sky-400" },
  you: { text: "YOU", cls: "bg-brand/20 text-brand" },
};

function Maker({ wallet, kind }: { wallet: string; kind?: WalletKind }) {
  const l = kind && LABEL[kind];
  return (
    <span className="flex items-center gap-1.5">
      <span className="text-muted">
        {wallet === "you" ? "You" : wallet === "crowd" ? "Traders (sim)" : wallet.startsWith("@") ? wallet : shortAddr(wallet)}
      </span>
      {l && <span className={`rounded px-1 text-[9px] font-bold ${l.cls}`}>{l.text}</span>}
    </span>
  );
}

function TradesTable({ coin, m }: { coin: Coin; m: Market }) {
  const rows = coin.trades.slice(-60).reverse();
  return (
    <table className="num w-full text-xs">
      <thead className="sticky top-0 bg-panel text-left text-dim">
        <tr>
          <th className="px-3 py-1.5 font-normal">Age</th>
          <th className="font-normal">Type</th>
          <th className="font-normal">MC</th>
          <th className="font-normal">Amount</th>
          <th className="font-normal">Maker</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((t, i) => (
          <tr key={t.t + ":" + i + ":" + t.wallet} className={`border-t border-line ${t.kind === "you" ? "bg-brand/5" : ""}`}>
            <td className="px-3 py-1 text-dim">{age(m.time - t.t)}</td>
            <td className={t.side === "buy" ? "text-up" : "text-down"}>{t.side === "buy" ? "Buy" : "Sell"}</td>
            <td><Sol>{mc(t.mcapUsd)}</Sol></td>
            <td><Sol className={t.side === "buy" ? "text-up" : "text-down"}>{sol(t.sol)}</Sol></td>
            <td><Maker wallet={t.wallet} kind={t.kind} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HoldersTable({ coin }: { coin: Coin }) {
  const rows = [...coin.holders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  const pool = coin.r.phase === "curve" ? TOTAL_SUPPLY - coin.r.tokensSold : coin.r.rTok;
  return (
    <table className="num w-full text-xs">
      <thead className="sticky top-0 bg-panel text-left text-dim">
        <tr>
          <th className="px-3 py-1.5 font-normal">#</th>
          <th className="font-normal">Wallet</th>
          <th className="font-normal">% Supply</th>
          <th className="font-normal">Amount</th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-t border-line">
          <td className="px-3 py-1 text-dim">–</td>
          <td className="text-muted">{coin.r.phase === "curve" ? "Bonding curve" : "Liquidity pool"}</td>
          <td>{pct((pool / TOTAL_SUPPLY) * 100, 2)}</td>
          <td>{tokens(pool)}</td>
        </tr>
        {rows.map(([w, b], i) => (
          <tr key={w} className={`border-t border-line ${w === "you" ? "bg-brand/5" : ""}`}>
            <td className="px-3 py-1 text-dim">{i + 1}</td>
            <td><Maker wallet={w} kind={coin.kinds.get(w)} /></td>
            <td>{pct((b / TOTAL_SUPPLY) * 100, 2)}</td>
            <td>{tokens(b)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MyTrades({ coin, m }: { coin: Coin; m: Market }) {
  const rows = m.history.filter((h) => h.coinId === coin.id).reverse();
  if (!rows.length) return <p className="p-6 text-center text-xs text-dim">You haven&apos;t traded this coin yet.</p>;
  return (
    <table className="num w-full text-xs">
      <thead className="sticky top-0 bg-panel text-left text-dim">
        <tr>
          <th className="px-3 py-1.5 font-normal">Age</th>
          <th className="font-normal">Type</th>
          <th className="font-normal">MC</th>
          <th className="font-normal">Amount</th>
          <th className="font-normal">Tokens</th>
          <th className="font-normal">PnL</th>
          <th className="font-normal">Fees</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((h) => (
          <tr key={h.id} className="border-t border-line">
            <td className="px-3 py-1 text-dim">{age(m.time - h.t)}</td>
            <td className={h.status === "failed" ? "text-dim" : h.side === "buy" ? "text-up" : "text-down"}>
              {h.status === "failed" ? `Failed ${h.side}` : h.side === "buy" ? "Buy" : "Sell"}
            </td>
            <td><Sol>{mc(h.mcapUsd)}</Sol></td>
            <td>{h.status === "failed" ? "–" : sol(h.sol)}</td>
            <td>{h.status === "failed" ? h.reason : tokens(h.tokens)}</td>
            <td className={(h.pnlSol ?? 0) > 0 ? "text-up" : (h.pnlSol ?? 0) < 0 ? "text-down" : "text-dim"}>
              {h.pnlSol === undefined ? "–" : `${signed(h.pnlSol, (x) => sol(x))} (${signed(h.pnlPct ?? 0, (x) => pct(x, 1))})`}
            </td>
            <td className="text-muted">{sol(h.fee + h.priorityFee, 4)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const TABS = ["Trades", "Holders", "My trades"] as const;

export function CoinTables({ coin, m }: { coin: Coin; m: Market }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Trades");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-9 shrink-0 items-center gap-1 border-b border-line px-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded px-2 py-1 text-xs ${tab === t ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}
          >
            {t}
            {t === "Holders" && <span className="ml-1 text-dim">{coin.holders.size}</span>}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "Trades" && <TradesTable coin={coin} m={m} />}
        {tab === "Holders" && <HoldersTable coin={coin} />}
        {tab === "My trades" && <MyTrades coin={coin} m={m} />}
      </div>
    </div>
  );
}
