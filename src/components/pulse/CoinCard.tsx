"use client";

import Link from "next/link";
import { TokenAvatar } from "@/components/TokenAvatar";
import { age, compact, mc, pct } from "@/lib/format";
import type { Coin, Market } from "@/lib/sim/market";
import { coinStats, type CoinStats } from "@/lib/sim/stats";
import { buy } from "@/lib/store";
import { SETTINGS } from "@/lib/settings";
import { Sol } from "@/components/Sol";
import { toggleWatch, useWatchlist } from "@/lib/prefs";

/** How long a coin shows the 🔥 badge after someone posted about it. */
export const HYPE_BADGE_MS = 120_000;

function Badge({ label, value, bad, title }: { label: string; value: string; bad: boolean; title: string }) {
  return (
    <span
      title={title}
      className={`num rounded border px-1.5 py-0.5 text-[11px] ${
        bad ? "border-down/30 bg-down/10 text-down" : "border-line-2 text-muted"
      }`}
    >
      <span className="text-dim">{label}</span> {value}
    </span>
  );
}

export function Socials({ coin }: { coin: Coin }) {
  const s = coin.plan.socials;
  const items = [s.x && "X", s.tg && "TG", s.web && "WEB"].filter(Boolean) as string[];
  if (!items.length) return null;
  return (
    <span className="flex gap-1">
      {items.map((i) => (
        <span key={i} className="rounded bg-panel-2 px-1 text-[9px] font-semibold text-muted">
          {i}
        </span>
      ))}
    </span>
  );
}

export function SignalBadges({ s }: { s: CoinStats }) {
  return (
    <div className="flex flex-wrap gap-1">
      <Badge label="Top10" value={pct(s.top10Pct)} bad={s.top10Pct > 30} title="Supply held by the 10 biggest wallets" />
      <Badge label="Dev" value={s.devSold ? "sold" : pct(s.devPct)} bad={s.devSold || s.devPct > 8} title="Supply held by the creator" />
      <Badge label="Snipers" value={pct(s.sniperPct)} bad={s.sniperPct > 10} title="Supply held by sniper bots" />
      <Badge label="Bundle" value={pct(s.bundlePct)} bad={s.bundlePct > 8} title="Supply bought in the creation block by linked wallets" />
      {s.devPrevRugs > 0 && (
        <span className="rounded border border-down/40 bg-down/15 px-1.5 py-0.5 text-[11px] font-semibold text-down" title="This dev rugged coins before">
          🚩 dev rugged {s.devPrevRugs}
        </span>
      )}
      {s.devPrevRugs === 0 && s.devPrevMigrations > 0 && (
        <span className="rounded border border-up/30 bg-up/10 px-1.5 py-0.5 text-[11px] text-up" title="This dev's coins have migrated before">
          ✅ dev migrated {s.devPrevMigrations}
        </span>
      )}
    </div>
  );
}

/** ⭐ toggle for the watchlist. Works inside links (doesn't navigate). */
export function StarButton({ coinId, className = "" }: { coinId: string; className?: string }) {
  const on = useWatchlist().has(coinId);
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleWatch(coinId);
      }}
      title={on ? "Remove from watchlist" : "Add to watchlist"}
      aria-label={on ? "Remove from watchlist" : "Add to watchlist"}
      className={`flex h-5 w-5 items-center justify-center rounded-full bg-bg/90 text-[11px] leading-none ${className} ${
        on ? "text-warn" : "text-dim opacity-0 group-hover:opacity-100"
      }`}
    >
      {on ? "★" : "☆"}
    </button>
  );
}

export function CoinCard({ coin, m }: { coin: Coin; m: Market }) {
  const s = coinStats(coin, m.time);
  const young = s.ageSec < 60;
  const held = (m.positions.get(coin.id)?.tokens ?? 0) > 0;
  return (
    <Link
      href={`/coin/${coin.id}`}
      className={`group block border-b border-line px-3 py-2.5 hover:bg-panel-2 ${young && s.ageSec < 3 ? "flash-in" : ""} ${coin.dead ? "opacity-50" : ""}`}
    >
      <div className="flex gap-3">
        <div className="relative shrink-0">
          <TokenAvatar coin={coin} size={52} />
          <StarButton coinId={coin.id} className="absolute -left-1.5 -top-1.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <span className="truncate font-semibold">{coin.ticker}</span>
              <span className="truncate text-xs text-muted">{coin.name}</span>
              {m.meta && coin.themes.includes(m.meta.word) && (
                <span className="shrink-0 rounded bg-orange-500/20 px-1 text-[10px] font-bold text-orange-400" title={`${m.meta.word} meta`}>
                  META
                </span>
              )}
              {coin.hypedAt !== undefined && m.time - coin.hypedAt < HYPE_BADGE_MS && (
                <span
                  className="shrink-0 rounded bg-orange-500/15 px-1 text-[10px] font-semibold text-orange-400"
                  title={`Posted about by ${coin.hypedBy === "you" ? "you" : "@" + coin.hypedBy}`}
                >
                  🔥 posted
                </span>
              )}
            </div>
            <div className="num shrink-0 text-sm">
              <span className="text-[10px] text-dim">MC </span>
              <Sol className={s.mcapUsd >= coin.startMcap ? "text-up" : "text-down"}>{mc(s.mcapUsd)}</Sol>
            </div>
          </div>
          <div className="num mt-0.5 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-muted">
              <span className={young ? "text-up" : ""}>{age(s.ageSec * 1000)}</span>
              <Socials coin={coin} />
              <span title="Holders">👤 {s.holders}</span>
              <span title="Buys / sells">
                <span className="text-up">{s.buys}</span>/<span className="text-down">{s.sells}</span>
              </span>
              {coin.mine ? (
                <span className="rounded bg-warn/20 px-1 text-[10px] font-semibold text-warn">YOUR COIN</span>
              ) : (
                held && <span className="rounded bg-brand/20 px-1 text-[10px] font-semibold text-brand">HOLDING</span>
              )}
            </div>
            <div>
              <span className="text-[10px] text-dim">V </span>
              <Sol size={10}>{compact(s.volumeSol)}</Sol>
            </div>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <SignalBadges s={s} />
            <button
              onClick={(e) => {
                e.preventDefault();
                buy(coin.id, SETTINGS.quickBuySol);
              }}
              className="num shrink-0 rounded-full bg-brand px-2.5 py-0.5 text-xs font-semibold text-white opacity-90 hover:opacity-100"
              title={`Quick buy ${SETTINGS.quickBuySol} SOL`}
            >
              ⚡ {SETTINGS.quickBuySol}
            </button>
          </div>
          {!s.graduated && (
            <div className="mt-1.5 h-1 overflow-hidden rounded bg-line" title={`Bonding curve ${pct(s.progress * 100)}`}>
              <div className="h-full bg-up/70" style={{ width: `${s.progress * 100}%` }} />
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
