"use client";

import { useState } from "react";
import { useUsername } from "@/lib/account";
import { count, pct, plural, signed } from "@/lib/format";
import type { Market } from "@/lib/sim/market";
import type { Social } from "@/lib/sim/social";
import { getSocial, useMarket } from "@/lib/store";
import { Avatar, TweetCard } from "./Tweet";

const ME_HUE = 262;
const MAX_TEXT = 280;
const SHOWN = 60;

/** Coins worth suggesting in the composer: yours first, then what you hold. */
function suggestions(m: Market): string[] {
  const out: string[] = [];
  for (const c of m.coins.values()) if (c.mine && !c.dead) out.push(c.ticker);
  for (const p of m.positions.values()) if (p.tokens > 0 && !out.includes(p.ticker)) out.push(p.ticker);
  return out.slice(0, 6);
}

/** Trades you can flex: closed or open, best first. */
function shareable(m: Market) {
  return [...m.positions.values()]
    .filter((p) => p.boughtSol > 0)
    .map((p) => {
      const pnl = p.realizedSol + (p.tokens > 0 ? m.positionValue(p.coinId) - p.costSol : 0);
      return { coinId: p.coinId, ticker: p.ticker, pnl, pnlPct: (pnl / p.boughtSol) * 100, open: p.tokens > 0 };
    })
    .sort((a, b) => b.pnlPct - a.pnlPct)
    .slice(0, 10);
}

function Composer({ m, s, name }: { m: Market; s: Social; name: string }) {
  const [text, setText] = useState("");
  const [pnlCoin, setPnlCoin] = useState("");
  const [result, setResult] = useState<{ ok: boolean; msg: string }>();
  const trades = shareable(m);

  const post = () => {
    const res = s.post(m, text, pnlCoin || undefined);
    if (!res.ok) return setResult({ ok: false, msg: res.reason });
    const t = res.tweet;
    setResult({
      ok: true,
      msg: `Posted! +${plural(t.gained ?? 0, "follower")}${t.apes ? `, ${plural(t.apes, "follower")} aping in` : ""}`,
    });
    setText("");
    setPnlCoin("");
  };

  return (
    <div className="border-b border-line p-4">
      <div className="flex gap-3">
        <Avatar name={name} hue={ME_HUE} />
        <div className="min-w-0 flex-1">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT))}
            placeholder="What's happening? Mention a coin with $TICKER"
            rows={3}
            className="w-full resize-none bg-transparent text-sm outline-none placeholder:text-dim"
          />
          {suggestions(m).length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {suggestions(m).map((t) => (
                <button
                  key={t}
                  onClick={() => setText((x) => (x ? x + " " : "") + "$" + t)}
                  className="rounded-full border border-line-2 px-2 py-0.5 text-xs text-brand hover:bg-brand/10"
                >
                  ${t}
                </button>
              ))}
            </div>
          )}
          <select
            value={pnlCoin}
            onChange={(e) => setPnlCoin(e.target.value)}
            className="mb-2 w-full rounded-md border border-line-2 bg-bg px-2 py-1.5 text-xs text-muted outline-none"
          >
            <option value="">📊 Attach a PnL card (optional)</option>
            {trades.map((t) => (
              <option key={t.coinId} value={t.coinId}>
                ${t.ticker} {signed(t.pnl, (x) => x.toFixed(3))} SOL ({signed(t.pnlPct, (x) => pct(x, 0))}){t.open ? " · open" : ""}
              </option>
            ))}
          </select>
          <div className="flex items-center justify-between">
            <span className="num text-xs text-dim">{text.length}/{MAX_TEXT}</span>
            <button
              onClick={post}
              disabled={!text.trim() && !pnlCoin}
              className="rounded-full bg-brand px-4 py-1.5 text-sm font-bold text-white disabled:opacity-40"
            >
              Post
            </button>
          </div>
          {result && <div className={`mt-2 text-xs ${result.ok ? "text-up" : "text-down"}`}>{result.msg}</div>}
        </div>
      </div>
    </div>
  );
}

export function SocialPanel({ onClose }: { onClose: () => void }) {
  const m = useMarket(1000);
  const s = getSocial();
  const username = useUsername();
  const [tab, setTab] = useState<"all" | "mine">("all");
  const name = username ?? "You";
  const feed = (tab === "all" ? s.feed : s.feed.filter((t) => t.author === "you")).slice(0, SHOWN);
  const myPosts = s.feed.filter((t) => t.author === "you").length;

  return (
    <aside className="fixed bottom-0 right-0 top-14 z-40 flex w-full flex-col border-l border-line-2 bg-panel shadow-2xl sm:w-[400px]">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <div>
          <div className="font-bold">𝕏 Feed</div>
          <div className="text-[10px] text-dim">Simulated. All accounts are fictional; parodies are labeled.</div>
        </div>
        <button onClick={onClose} className="rounded px-2 py-1 text-lg text-muted hover:text-text" aria-label="Close feed">✕</button>
      </div>

      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Avatar name={name} hue={ME_HUE} size={44} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-bold">{name}</div>
          <div className="num text-xs text-muted">
            <b className="text-text">{count(s.followers)}</b> followers · {plural(myPosts, "post")}
          </div>
        </div>
        <div className="text-right text-[10px] leading-tight text-dim">
          More followers =<br />more buyers when you shill
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Composer m={m} s={s} name={name} />
        <div className="sticky top-0 z-10 flex border-b border-line bg-panel">
          {(["all", "mine"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`flex-1 py-2.5 text-sm ${tab === k ? "border-b-2 border-brand font-semibold text-text" : "text-muted"}`}
            >
              {k === "all" ? "For you" : "Your posts"}
            </button>
          ))}
        </div>
        {feed.map((t) => (
          <TweetCard key={t.id} t={t} now={m.time} me={{ name, hue: ME_HUE }} />
        ))}
        {!feed.length && <p className="p-8 text-center text-sm text-dim">Nothing here yet.</p>}
      </div>
    </aside>
  );
}
