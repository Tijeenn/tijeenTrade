"use client";

import Link from "next/link";
import { useState } from "react";
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
function Body({ text, links, you }: { text: string; links: Record<string, string>; you: string }) {
  const parts = text.split(/(\$[A-Za-z0-9]{1,10}|\{you\})/g);
  return (
    <p className="whitespace-pre-wrap break-words text-sm">
      {parts.map((p, i) => {
        if (p === "{you}") return <span key={i} className="font-semibold text-sky-400">@{you}</span>;
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

/** Side accent by what kind of post it is. */
const ACCENT: Partial<Record<NonNullable<Tweet["kind"]>, string>> = {
  warning: "border-l-2 border-l-down bg-down/5",
  rug: "border-l-2 border-l-down bg-down/5",
  clean: "border-l-2 border-l-up bg-up/5",
  whale: "border-l-2 border-l-sky-500 bg-sky-500/5",
  gainer: "border-l-2 border-l-up",
  keyword: "border-l-2 border-l-orange-500",
  meta: "border-l-2 border-l-orange-500",
};

/** Replies trickle in over the first seconds, like a real thread. */
function Replies({ t, ageMs, you }: { t: Tweet; ageMs: number; you: string }) {
  const [open, setOpen] = useState(false);
  const visible = (t.replies ?? []).filter((_, i) => ageMs > 2500 + i * 3500);
  if (!visible.length) return null;
  const shown = open ? visible : visible.slice(0, 2);
  return (
    <div className="mt-2 flex flex-col gap-1 border-l border-line-2 pl-3">
      {shown.map((r, i) => (
        <div key={i} className="text-xs">
          <span className="font-semibold text-muted">@{r.handle}</span>{" "}
          <span className="text-text/90">{r.text.replace("{you}", "@" + you)}</span>
        </div>
      ))}
      {visible.length > 2 && (
        <button onClick={() => setOpen(!open)} className="self-start text-[11px] text-brand hover:underline">
          {open ? "Show less" : `Show ${visible.length - 2} more ${visible.length - 2 === 1 ? "reply" : "replies"}`}
        </button>
      )}
    </div>
  );
}

export function TweetCard({ t, now, me }: { t: Tweet; now: number; me: { name: string; hue: number } }) {
  const acc = t.author === "you" ? undefined : getAccount(t.author);
  const name = acc?.name ?? me.name;
  const myHandle = me.name.toLowerCase().replace(/[^a-z0-9_]/g, "") || "you";
  const handle = acc?.id ?? myHandle;
  const ageMs = Math.max(0, now - t.t);
  // engagement trickles in over the first minute
  const grow = 1 - Math.exp(-ageMs / 20_000);
  const verified = acc && (acc.tier === "mega" || acc.tier === "kol" || acc.tier === "news");
  return (
    <article className={`flex gap-3 border-b border-line px-4 py-3 ${t.author === "you" ? "bg-brand/5" : t.kind ? ACCENT[t.kind] ?? "" : ""}`}>
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
        <Body text={t.text} links={t.links} you={myHandle} />
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
          <span>💬 {(t.replies ?? []).filter((_, i) => ageMs > 2500 + i * 3500).length}</span>
          <span>↻ {count(t.reposts * grow)}</span>
          <span>♥ {count(t.likes * grow)}</span>
          <span>👁 {count(t.views * grow)}</span>
        </div>
        <Replies t={t} ageMs={ageMs} you={myHandle} />
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
