"use client";

import { useState } from "react";
import { pct, signed, sol, tokens } from "@/lib/format";
import { SETTINGS } from "@/lib/settings";
import { price, quoteBuy, quoteSell } from "@/lib/sim/curve";
import { PLATFORM_FEE, type Coin, type Market } from "@/lib/sim/market";
import { buy, sellPct } from "@/lib/store";
import { ShareButton } from "@/components/ShareCard";
import { Sol, SolIcon } from "@/components/Sol";

type Side = "buy" | "sell";

function NumField({ label, value, onChange, suffix }: {
  label: string; value: string; onChange: (v: string) => void; suffix: React.ReactNode;
}) {
  return (
    <label className="flex flex-1 items-center gap-1 rounded border border-line-2 bg-bg px-2 py-1 text-xs">
      <span className="text-dim">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="num w-full min-w-0 bg-transparent text-right outline-none"
      />
      <span className="text-dim">{suffix}</span>
    </label>
  );
}

export function TradePanel({ coin, m }: { coin: Coin; m: Market }) {
  const [side, setSide] = useState<Side>("buy");
  const [buyAmt, setBuyAmt] = useState(String(SETTINGS.quickBuySol));
  const [sellAmt, setSellAmt] = useState("100");
  const [slip, setSlip] = useState(String(SETTINGS.slippagePct));
  const [prio, setPrio] = useState(String(SETTINGS.priorityFeeSol));
  const [error, setError] = useState<string>();

  const pos = m.positions.get(coin.id);
  const held = pos?.tokens ?? 0;
  const pending = m.pending.filter((o) => o.coinId === coin.id).length;
  const opts = { slippagePct: Number(slip) || 0, priorityFeeSol: Number(prio) || 0 };

  let estimate: React.ReactNode = "";
  let impact = 0;
  if (side === "buy") {
    const amt = Number(buyAmt);
    if (amt > 0) {
      const q = quoteBuy(coin.r, amt * (1 - PLATFORM_FEE));
      impact = ((q.solUsed - q.fee) / q.tokensOut / price(coin.r) - 1) * 100;
      estimate = `≈ ${tokens(q.tokensOut)} ${coin.ticker}`;
    }
  } else {
    const t = (held * Math.min(100, Number(sellAmt) || 0)) / 100;
    if (t > 0) {
      const q = quoteSell(coin.r, t);
      impact = (1 - q.gross / t / price(coin.r)) * 100;
      estimate = <>≈ <Sol>{sol(q.solOut * (1 - PLATFORM_FEE))}</Sol></>;
    }
  }

  const submit = () => {
    const res = side === "buy" ? buy(coin.id, Number(buyAmt), opts) : sellPct(coin.id, Number(sellAmt), opts);
    setError(res.ok ? undefined : res.reason);
  };

  const presets = side === "buy" ? SETTINGS.buyPresets : SETTINGS.sellPresets;
  const amount = side === "buy" ? buyAmt : sellAmt;

  return (
    <div className="border-b border-line p-3">
      <div className="mb-3 grid grid-cols-2 rounded-md bg-bg p-0.5 text-sm font-semibold">
        {(["buy", "sell"] as const).map((s) => (
          <button
            key={s}
            onClick={() => { setSide(s); setError(undefined); }}
            className={`rounded py-1.5 capitalize ${side === s ? (s === "buy" ? "bg-up/15 text-up" : "bg-down/15 text-down") : "text-muted"}`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mb-2 grid grid-cols-4 gap-1">
        {presets.map((p) => (
          <button
            key={p}
            onClick={() => (side === "buy" ? setBuyAmt(String(p)) : setSellAmt(String(p)))}
            className={`num rounded border py-1 text-xs ${
              amount === String(p) ? "border-brand text-text" : "border-line-2 text-muted hover:text-text"
            }`}
          >
            {side === "buy" ? p : p + "%"}
          </button>
        ))}
      </div>
      <div className="mb-2 flex">
        <NumField
          label="Amount"
          value={amount}
          onChange={side === "buy" ? setBuyAmt : setSellAmt}
          suffix={side === "buy" ? <SolIcon size={11} /> : "%"}
        />
      </div>
      <div className="mb-3 flex gap-1">
        <NumField label="Slip" value={slip} onChange={setSlip} suffix="%" />
        <NumField label="Prio" value={prio} onChange={setPrio} suffix={<SolIcon size={11} />} />
      </div>

      <button
        onClick={submit}
        className={`w-full rounded-md py-2.5 text-sm font-bold text-bg ${side === "buy" ? "bg-up hover:bg-up/90" : "bg-down hover:bg-down/90"}`}
      >
        {side === "buy" ? "Buy" : "Sell"} {coin.ticker}
      </button>
      <div className="num mt-2 flex justify-between text-[11px] text-muted">
        <span>{estimate}</span>
        <span className={impact > 5 ? "text-warn" : ""}>{estimate && `impact ${pct(impact, 1)}`}</span>
      </div>
      {pending > 0 && <div className="mt-1 text-[11px] text-brand">Sending {pending} transaction{pending > 1 ? "s" : ""}…</div>}
      {error && <div className="mt-1 text-[11px] text-down">{error}</div>}
      <div className="mt-2 text-[10px] leading-tight text-dim">
        Fees: {coin.r.phase === "curve" ? "1% pump curve" : "0.25% pool"} + {PLATFORM_FEE * 100}% platform + priority fee. Orders land
        after 0.2–0.9s; a higher priority fee lands faster.
      </div>
    </div>
  );
}

export function PositionBox({ coin, m }: { coin: Coin; m: Market }) {
  const pos = m.positions.get(coin.id);
  if (!pos) return null;
  const value = m.positionValue(coin.id);
  const unrealized = pos.tokens > 0 ? value - pos.costSol : 0;
  const total = pos.realizedSol + unrealized;
  const totalPct = pos.boughtSol > 0 ? (total / pos.boughtSol) * 100 : 0;
  const color = total >= 0 ? "text-up" : "text-down";
  return (
    <div className="num border-b border-line p-3 text-xs">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="flex items-center gap-2 font-semibold text-muted">
          Your position {pos.boughtSol > 0 && <ShareButton coinId={coin.id} label="📸" />}
        </span>
        <span className={`text-sm font-bold ${color}`}>
          <Sol size={13}>{signed(total, (x) => sol(x))} ({signed(totalPct, (x) => pct(x, 1))})</Sol>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        <span className="text-dim">Holding</span>
        <span className="text-right">{tokens(pos.tokens)}</span>
        <span className="text-dim">Value</span>
        <Sol className="justify-end">{sol(value)}</Sol>
        <span className="text-dim">Bought</span>
        <Sol className="justify-end">{sol(pos.boughtSol)}</Sol>
        <span className="text-dim">Sold</span>
        <Sol className="justify-end">{sol(pos.soldSol)}</Sol>
        <span className="text-dim">Unrealized</span>
        <span className={`text-right ${unrealized >= 0 ? "text-up" : "text-down"}`}>{signed(unrealized, (x) => sol(x))}</span>
        <span className="text-dim">Realized</span>
        <span className={`text-right ${pos.realizedSol >= 0 ? "text-up" : "text-down"}`}>{signed(pos.realizedSol, (x) => sol(x))}</span>
      </div>
    </div>
  );
}
