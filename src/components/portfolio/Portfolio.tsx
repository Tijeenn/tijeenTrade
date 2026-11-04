"use client";

import Link from "next/link";
import { useState } from "react";
import { Sol } from "@/components/Sol";
import { TokenAvatar } from "@/components/TokenAvatar";
import { age, mc, pct, signed, sol, tokens } from "@/lib/format";
import { portfolioStats } from "@/lib/portfolio";
import { mcapUsd } from "@/lib/sim/curve";
import type { Market } from "@/lib/sim/market";
import { getRun, sellPct, useMarket, wallMs } from "@/lib/store";
import { EquityChart } from "./EquityChart";

const tone = (n: number) => (n > 0 ? "text-up" : n < 0 ? "text-down" : "text-text");
const pnlSol = (n: number) => signed(n, (x) => sol(x));

function Card({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-3">
      <div className="text-[10px] uppercase tracking-wide text-dim">{label}</div>
      <div className="num mt-1 text-lg font-semibold">{children}</div>
      {sub && <div className="num text-xs text-muted">{sub}</div>}
    </div>
  );
}

const th = "px-3 py-2 font-normal text-left";
const td = "px-3 py-2";

function OpenPositions({ m }: { m: Market }) {
  const { open } = portfolioStats(m);
  if (!open.length) return <Empty text="No open positions. Find something on Pulse." />;
  return (
    <table className="num w-full min-w-[720px] text-xs">
      <thead className="text-dim">
        <tr>
          <th className={th}>Token</th>
          <th className={th}>Value</th>
          <th className={th}>Bought</th>
          <th className={th}>Avg entry MC</th>
          <th className={th}>Now MC</th>
          <th className={th}>PnL</th>
          <th className={th}>Sell</th>
        </tr>
      </thead>
      <tbody>
        {open.map(({ pos, value, pnl, pnlPct, avgEntryMcapUsd }) => {
          const coin = m.coins.get(pos.coinId)!;
          return (
            <tr key={pos.coinId} className="border-t border-line">
              <td className={td}>
                <Link href={`/coin/${pos.coinId}`} className="flex items-center gap-2 hover:text-brand">
                  <TokenAvatar coin={coin} size={28} />
                  <div>
                    <div className="font-semibold">{coin.ticker}</div>
                    <div className="text-dim">{tokens(pos.tokens)}</div>
                  </div>
                </Link>
              </td>
              <td className={td}><Sol>{sol(value)}</Sol></td>
              <td className={td}><Sol>{sol(pos.boughtSol)}</Sol></td>
              <td className={td}><Sol>{mc(avgEntryMcapUsd)}</Sol></td>
              <td className={td}><Sol>{mc(mcapUsd(coin.r))}</Sol></td>
              <td className={`${td} ${tone(pnl)}`}>
                <Sol>{pnlSol(pnl)}</Sol> <span className="text-[11px]">({signed(pnlPct, (x) => pct(x, 1))})</span>
              </td>
              <td className={td}>
                <div className="flex gap-1">
                  {[50, 100].map((p) => (
                    <button
                      key={p}
                      onClick={() => sellPct(pos.coinId, p)}
                      className="rounded border border-down/40 px-2 py-0.5 text-down hover:bg-down/10"
                    >
                      {p}%
                    </button>
                  ))}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Closed({ m }: { m: Market }) {
  const { closed } = portfolioStats(m);
  if (!closed.length) return <Empty text="No closed trades yet." />;
  return (
    <table className="num w-full min-w-[520px] text-xs">
      <thead className="text-dim">
        <tr>
          <th className={th}>Token</th>
          <th className={th}>Bought</th>
          <th className={th}>Sold</th>
          <th className={th}>PnL</th>
          <th className={th}>Return</th>
        </tr>
      </thead>
      <tbody>
        {closed.map((p) => (
          <tr key={p.coinId} className="border-t border-line">
            <td className={`${td} font-semibold`}>
              {m.coins.has(p.coinId) ? <Link href={`/coin/${p.coinId}`} className="hover:text-brand">{p.ticker}</Link> : p.ticker}
            </td>
            <td className={td}><Sol>{sol(p.boughtSol)}</Sol></td>
            <td className={td}><Sol>{sol(p.soldSol)}</Sol></td>
            <td className={`${td} ${tone(p.realizedSol)}`}><Sol>{pnlSol(p.realizedSol)}</Sol></td>
            <td className={`${td} ${tone(p.realizedSol)}`}>{signed((p.realizedSol / p.boughtSol) * 100, (x) => pct(x, 1))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function History({ m }: { m: Market }) {
  const rows = [...m.history].reverse();
  if (!rows.length) return <Empty text="No trades yet." />;
  return (
    <table className="num w-full min-w-[760px] text-xs">
      <thead className="text-dim">
        <tr>
          <th className={th}>Time</th>
          <th className={th}>Token</th>
          <th className={th}>Type</th>
          <th className={th}>Amount</th>
          <th className={th}>Tokens</th>
          <th className={th}>MC</th>
          <th className={th}>PnL</th>
          <th className={th}>Fees</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((h) => (
          <tr key={h.id} className="border-t border-line">
            <td className={`${td} text-dim`} title={new Date(wallMs(h.t)).toLocaleString()}>{age(m.time - h.t)} ago</td>
            <td className={`${td} font-semibold`}>{h.ticker}</td>
            <td className={`${td} ${h.status === "failed" ? "text-dim" : h.side === "buy" ? "text-up" : "text-down"}`}>
              {h.status === "failed" ? `Failed ${h.side} · ${h.reason}` : h.side === "buy" ? "Buy" : "Sell"}
            </td>
            <td className={td}>{h.status === "ok" ? <Sol>{sol(h.sol)}</Sol> : "–"}</td>
            <td className={td}>{h.status === "ok" ? tokens(h.tokens) : "–"}</td>
            <td className={td}><Sol>{mc(h.mcapUsd)}</Sol></td>
            <td className={`${td} ${tone(h.pnlSol ?? 0)}`}>
              {h.pnlSol === undefined ? "–" : <><Sol>{pnlSol(h.pnlSol)}</Sol> <span className="text-[11px]">({signed(h.pnlPct ?? 0, (x) => pct(x, 1))})</span></>}
            </td>
            <td className={`${td} text-muted`}><Sol>{sol(h.fee + h.priorityFee, 4)}</Sol></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="p-8 text-center text-sm text-dim">{text}</p>;
}

const TABS = ["Open", "Closed", "History"] as const;

export function Portfolio() {
  const m = useMarket(500);
  const run = getRun();
  const s = portfolioStats(m);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Open");
  const wins = s.closed.filter((p) => p.realizedSol > 0).length;
  const counts = { Open: s.open.length, Closed: s.closed.length, History: m.history.length };

  return (
    <div className="mx-auto w-full max-w-6xl p-4">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-xl font-bold">Portfolio</h1>
        <span className="text-xs text-dim">
          Run started {age(wallMs(m.time) - run.startedAt)} ago with <Sol>{sol(m.startSol)}</Sol>
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
        <Card label="Balance"><Sol size={14}>{sol(m.sol)}</Sol></Card>
        <Card label="Equity" sub={<span className={tone(s.pnl)}>{signed(s.pnlPct, (x) => pct(x, 1))}</span>}>
          <Sol size={14}>{sol(s.equity)}</Sol>
        </Card>
        <Card label="Total PnL"><Sol size={14} className={tone(s.pnl)}>{pnlSol(s.pnl)}</Sol></Card>
        <Card label="Realized / Unrealized" sub={<Sol className={tone(s.unrealized)}>{pnlSol(s.unrealized)}</Sol>}>
          <Sol size={14} className={tone(s.realized)}>{pnlSol(s.realized)}</Sol>
        </Card>
        <Card label="Win rate" sub={`${wins}W / ${s.closed.length - wins}L`}>
          {s.closed.length ? pct(s.winRate * 100, 0) : "–"}
        </Card>
        <Card label="Fees paid" sub={`${s.trades} trades`}><Sol size={14}>{sol(s.fees, 3)}</Sol></Card>
      </div>

      {(s.best || s.worst) && (
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted">
          {s.best && s.best.realizedSol > 0 && (
            <span>Best trade: <b className="text-text">{s.best.ticker}</b> <Sol className="text-up">{pnlSol(s.best.realizedSol)}</Sol></span>
          )}
          {s.worst && s.worst.realizedSol < 0 && (
            <span>Worst trade: <b className="text-text">{s.worst.ticker}</b> <Sol className="text-down">{pnlSol(s.worst.realizedSol)}</Sol></span>
          )}
        </div>
      )}

      <div className="mt-4 h-56 overflow-hidden rounded-lg border border-line">
        <EquityChart run={run} startSol={m.startSol} />
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-line bg-panel">
        <div className="flex gap-1 border-b border-line p-1.5">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded px-3 py-1 text-xs ${tab === t ? "bg-panel-2 text-text" : "text-muted hover:text-text"}`}
            >
              {t} <span className="text-dim">{counts[t]}</span>
            </button>
          ))}
        </div>
        <div className="overflow-x-auto">
          {tab === "Open" && <OpenPositions m={m} />}
          {tab === "Closed" && <Closed m={m} />}
          {tab === "History" && <History m={m} />}
        </div>
      </div>
    </div>
  );
}
