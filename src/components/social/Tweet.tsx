"use client";

import Link from "next/link";
import { Sol } from "@/components/Sol";
import { age, count, pct, plural, signed, sol } from "@/lib/format";
import { getAccount, type Tweet } from "@/lib/sim/social";

export function Avatar({ name, hue, size = 36 }: { name: string; hue: number; size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{
        width: size, height: size, fontSize: size * 0.38,
        background: `linear-gradient(135deg, hsl(${hue} 65% 50%), hsl(${(hue + 40) % 360} 70% 30%))`,
      }}
    >
      {name.replace(/[^A-Za-z]/g, "").slice(0, 1).toUpperCase() || "?"}
    </div>
  );
}

/** Post text with $TICKERs turned into links to the coin. */
function Body({ text, links }: { text: string; links: Record<string, string> }) {
  const parts = text.split(/(\$[A-Za-z0-9]{1,10})/g);
  return (
    <p className="whitespace-pre-wrap break-words text-sm">
      {parts.map((p, i) => {
        const id = p.startsWith("$") ? links[p.slice(1).toUpperCase()] : undefined;
        return id ? (
          <Link key={i} href={`/coin/${id}`} className="font-semibold text-brand hover:underline">{p}</Link>
        ) : (
          <span key={i}>{p}</span>
        );
      })}
    </p>
  );
}

export function TweetCard({ t, now, me }: { t: Tweet; now: number; me: { name: string; hue: number } }) {
  const acc = t.author === "you" ? undefined : getAccount(t.author);
  const name = acc?.name ?? me.name;
  const handle = acc?.id ?? me.name.toLowerCase().replace(/[^a-z0-9_]/g, "") ?? "you";
  const ageMs = Math.max(0, now - t.t);
  // engagement trickles in over the first minute
  const grow = 1 - Math.exp(-ageMs / 20_000);
  const verified = acc && (acc.tier === "mega" || acc.tier === "kol" || acc.tier === "news");
  return (
    <article className={`flex gap-3 border-b border-line px-4 py-3 ${t.author === "you" ? "bg-brand/5" : ""}`}>
      <Avatar name={name} hue={acc?.hue ?? me.hue} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-1.5 text-sm">
          <span className="font-bold">{name}</span>
          {verified && <span className="text-sky-400" title="Verified (simulated)">✓</span>}
          {acc?.parody && (
            <span className="rounded bg-warn/15 px-1 text-[9px] font-bold text-warn" title="Fictional parody account">PARODY</span>
          )}
          <span className="text-dim">@{handle} · {age(ageMs)}</span>
        </div>
        <Body text={t.text} links={t.links} />
        {t.pumped && t.pumped.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {t.pumped.map((p) => (
              <Link key={p.coinId} href={`/coin/${p.coinId}`} className="rounded-full bg-up/15 px-2 py-0.5 text-xs font-semibold text-up hover:bg-up/25">
                📈 ${p.ticker}
              </Link>
            ))}
          </div>
        )}
        {t.pnl && (
          <div className={`num mt-2 rounded-lg border p-3 ${t.pnl.pnlSol >= 0 ? "border-up/40 bg-up/5" : "border-down/40 bg-down/5"}`}>
            <div className="text-xs text-muted">${t.pnl.ticker} · tijeen.trade</div>
            <Sol size={16} className={`text-xl font-bold ${t.pnl.pnlSol >= 0 ? "text-up" : "text-down"}`}>
              {signed(t.pnl.pnlSol, (x) => sol(x))} <span className="text-sm">({signed(t.pnl.pnlPct, (x) => pct(x, 0))})</span>
            </Sol>
          </div>
        )}
        <div className="num mt-2 flex gap-5 text-xs text-dim">
          <span>↻ {count(t.reposts * grow)}</span>
          <span>♥ {count(t.likes * grow)}</span>
          <span>👁 {count(t.views * grow)}</span>
        </div>
        {t.author === "you" && (t.gained !== undefined || t.apes) ? (
          <div className="num mt-1 text-xs text-brand">
            {t.gained ? `+${plural(t.gained, "follower")}` : "No new followers"}
            {t.apes ? ` · ${plural(t.apes, "follower")} aped in` : ""}
          </div>
        ) : null}
      </div>
    </article>
  );
}
