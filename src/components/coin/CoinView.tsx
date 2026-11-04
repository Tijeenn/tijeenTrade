"use client";

import Link from "next/link";
import { HYPE_BADGE_MS, Socials, StarButton } from "@/components/pulse/CoinCard";
import { getAccount } from "@/lib/sim/social";
import { TokenAvatar } from "@/components/TokenAvatar";
import { age, compact, mc, pct, shortAddr } from "@/lib/format";
import type { Coin, Market } from "@/lib/sim/market";
import { coinStats } from "@/lib/sim/stats";
import { useMarket } from "@/lib/store";
import { Chart } from "./Chart";
import { CoinTables } from "./Tables";
import { DevPanel } from "./DevPanel";
import { AutoSell } from "./AutoSell";
import { PositionBox, TradePanel } from "./TradePanel";
import { Sol } from "@/components/Sol";

function Stat({ label, value, cls = "", sol }: { label: string; value: string; cls?: string; sol?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-dim">{label}</div>
      <div className={`num text-sm ${cls}`}>{sol ? <Sol>{value}</Sol> : value}</div>
    </div>
  );
}

function Row({ label, value, bad, hint, sol }: { label: string; value: string; bad?: boolean; hint: string; sol?: boolean }) {
  return (
    <div className="flex justify-between py-1" title={hint}>
      <span className="text-dim">{label}</span>
      <span className={`num ${bad ? "text-down" : "text-text"}`}>{sol ? <Sol>{value}</Sol> : value}</span>
    </div>
  );
}

function TokenInfo({ coin, m }: { coin: Coin; m: Market }) {
  const s = coinStats(coin, m.time);
  return (
    <div className="p-3 text-xs">
      <div className="mb-2 font-semibold text-muted">Token info</div>
      {!s.graduated && (
        <div className="mb-3">
          <div className="mb-1 flex justify-between">
            <span className="text-dim">Bonding curve</span>
            <span className="num">{pct(s.progress * 100, 1)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded bg-line">
            <div className="h-full bg-up" style={{ width: `${s.progress * 100}%` }} />
          </div>
          <div className="mt-1 text-[10px] text-dim">Migrates to a liquidity pool at 100% (~410 SOL market cap)</div>
        </div>
      )}
      <Row label="Top 10 holders" value={pct(s.top10Pct, 1)} bad={s.top10Pct > 30} hint="Share of supply held by the 10 biggest wallets" />
      <Row label="Dev holds" value={s.devSold ? "Sold" : pct(s.devPct, 1)} bad={s.devSold || s.devPct > 8} hint="Share held by the creator" />
      <Row label="Snipers" value={pct(s.sniperPct, 1)} bad={s.sniperPct > 10} hint="Share held by bots that bought in the first second" />
      <Row label="Bundled" value={pct(s.bundlePct, 1)} bad={s.bundlePct > 8} hint="Share bought by linked wallets in the creation block" />
      <Row label="Holders" value={String(s.holders)} hint="Wallets holding the token" />
      <Row
        label="Dev history"
        value={coin.mine ? "You" : s.devPrevCoins === 0 ? "First coin" : `${s.devPrevCoins} coins · ${s.devPrevRugs} rugged · ${s.devPrevMigrations} migrated`}
        bad={s.devPrevRugs > 0}
        hint="What this dev's other coins did. Serial ruggers reuse their wallets"
      />
      <Row label="ATH" value={mc(s.athMcapUsd)} sol hint="Highest market cap so far" />
      <div className="mt-3 flex items-center justify-between text-[11px] text-dim">
        <span>CA: {shortAddr(coin.id)}</span>
        <span>Dev: {coin.mine ? "You" : shortAddr(coin.dev)}</span>
      </div>
    </div>
  );
}

export function CoinView({ id }: { id: string }) {
  const m = useMarket(250);
  const coin = m.coins.get(id);
  if (!coin) {
    return (
      <div className="p-10 text-center text-sm text-muted">
        This coin is gone. Dead coins get cleaned up after a while.{" "}
        <Link href="/" className="text-brand">Back to Pulse</Link>
      </div>
    );
  }
  const s = coinStats(coin, m.time);
  const liquiditySol = (coin.r.phase === "curve" ? coin.r.realSol : coin.r.rSol) * 2;
  const change = (s.mcapUsd / coin.startMcap - 1) * 100;

  return (
    <div className="flex flex-col lg:h-[calc(100dvh-3.5rem)] lg:flex-row">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:border-r lg:border-line">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-4 py-3">
          <div className="flex items-center gap-3">
            <TokenAvatar coin={coin} size={40} />
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold">{coin.ticker}</span>
                <span className="text-sm text-muted">{coin.name}</span>
                <Socials coin={coin} />
                <StarButton coinId={coin.id} className="!h-6 !w-6 border border-line-2 !text-sm !opacity-100" />
              </div>
              <div className="text-xs text-dim">
                {age(s.ageSec * 1000)} old
                {s.graduated && <span className="ml-2 rounded bg-up/15 px-1 text-up">Migrated</span>}
                {coin.dead && <span className="ml-2 rounded bg-line-2 px-1 text-muted">Inactive</span>}
                {coin.shared && (
                  <span className="ml-2 rounded bg-sky-500/15 px-1 font-semibold text-sky-400" title="Every player sees and trades this same coin">
                    🌍 Public coin by {coin.mine ? "you" : "@" + coin.shared.creator}
                  </span>
                )}
                {m.meta && coin.themes.includes(m.meta.word) && (
                  <span className="ml-2 rounded bg-orange-500/20 px-1 font-bold text-orange-400">🔥 {m.meta.word.toUpperCase()} META</span>
                )}
                {coin.hypedAt !== undefined && m.time - coin.hypedAt < HYPE_BADGE_MS && (
                  <span className="ml-2 rounded bg-orange-500/15 px-1 font-semibold text-orange-400">
                    🔥 {coin.hypedBy === "you" ? "You" : getAccount(coin.hypedBy ?? "")?.name ?? "@" + coin.hypedBy} posted about
                    it {age(m.time - coin.hypedAt)} ago
                  </span>
                )}
              </div>
            </div>
          </div>
          <Sol size={18} className="text-xl font-bold">{mc(s.mcapUsd, 2)}</Sol>
          <Stat label="Since launch" value={(change >= 0 ? "+" : "") + pct(change, 1)} cls={change >= 0 ? "text-up" : "text-down"} />
          <Stat label="Liquidity" value={compact(liquiditySol)} sol />
          <Stat label="Volume" value={compact(s.volumeSol)} sol />
          <Stat label="Buys / Sells" value={`${s.buys} / ${s.sells}`} />
        </div>
        <div className="h-[380px] shrink-0 border-b border-line lg:h-auto lg:min-h-[300px] lg:flex-[3]">
          <Chart coin={coin} m={m} />
        </div>
        <div className="flex h-[360px] min-h-0 flex-col lg:h-auto lg:flex-[2]">
          <CoinTables coin={coin} m={m} />
        </div>
      </div>
      <aside className="w-full shrink-0 overflow-y-auto bg-panel lg:w-[330px]">
        {coin.mine && <DevPanel coin={coin} m={m} />}
        <TradePanel coin={coin} m={m} />
        <PositionBox coin={coin} m={m} />
        {!coin.shared && <AutoSell coin={coin} m={m} />}
        <TokenInfo coin={coin} m={m} />
      </aside>
    </div>
  );
}
