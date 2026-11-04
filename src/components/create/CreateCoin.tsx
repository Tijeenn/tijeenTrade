"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sol, SolIcon } from "@/components/Sol";
import { TokenAvatar } from "@/components/TokenAvatar";
import { mc, pct, sol } from "@/lib/format";
import { applyBuy, mcapUsd, newReserves, quoteBuy, TOTAL_SUPPLY } from "@/lib/sim/curve";
import { CREATE_FEE_SOL } from "@/lib/sim/market";
import { useUsername } from "@/lib/account";
import { launchPublic } from "@/lib/shared";
import { getMarket, useMarket } from "@/lib/store";

const DEV_PRESETS = [0, 0.5, 1, 2, 5];
const SOCIALS = [
  { key: "x", label: "X / Twitter" },
  { key: "tg", label: "Telegram" },
  { key: "web", label: "Website" },
] as const;

/** What a dev buy of `solIn` gets you on a fresh curve. */
function devBuyPreview(solIn: number) {
  const r = newReserves();
  if (!(solIn > 0)) return { supplyPct: 0, mcapUsd: mcapUsd(r) };
  const q = quoteBuy(r, solIn);
  applyBuy(r, q);
  return { supplyPct: (q.tokensOut / TOTAL_SUPPLY) * 100, mcapUsd: mcapUsd(r) };
}

function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-1.5">
      <div className="text-sm font-medium">{children}</div>
      {hint && <div className="text-xs text-dim">{hint}</div>}
    </div>
  );
}

const inputCls = "w-full rounded-md border border-line-2 bg-bg px-3 py-2 outline-none focus:border-brand";

export function CreateCoin() {
  const router = useRouter();
  const m = useMarket(1000);
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [hue, setHue] = useState(() => Math.floor(Math.random() * 360));
  const [socials, setSocials] = useState({ x: true, tg: false, web: false });
  const [devBuy, setDevBuy] = useState("0.5");
  const [error, setError] = useState<string>();
  const username = useUsername();
  const [publicPick, setIsPublic] = useState(true);
  const isPublic = publicPick && !!username;
  const [busy, setBusy] = useState(false);

  const dev = Number(devBuy);
  const devOk = devBuy === "" || (Number.isFinite(dev) && dev >= 0);
  const preview = devBuyPreview(devOk ? dev || 0 : 0);
  const total = CREATE_FEE_SOL + (devOk ? dev || 0 : 0);
  const shownTicker = ticker.trim().toUpperCase() || "TICKER";
  const valid = name.trim().length > 0 && /^[A-Za-z0-9]{1,10}$/.test(ticker.trim()) && devOk && total <= m.sol;

  const launch = async () => {
    if (isPublic) {
      setBusy(true);
      try {
        const id = await launchPublic({ name: name.trim(), ticker: ticker.trim(), hue, socials, devBuySol: dev || 0 });
        router.push(`/coin/${id}`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Launch failed");
        setBusy(false);
      }
      return;
    }
    const res = getMarket().launch({ name, ticker, hue, socials, devBuySol: dev || 0 });
    if (!res.ok) return setError(res.reason);
    router.push(`/coin/${res.coinId}`);
  };

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-6 p-4 md:grid-cols-[1fr_320px]">
      <div className="flex flex-col gap-5">
        <div>
          <h1 className="text-xl font-bold">Launch a coin</h1>
          <p className="mt-1 text-sm text-muted">
            You&apos;re the dev. Traders, snipers and KOLs will find it in New Pairs. Ride it up, take profit, or rug it. 😈
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>Name</Label>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={32} placeholder="Sad Frog" className={inputCls} />
          </div>
          <div>
            <Label>Ticker</Label>
            <input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())}
              maxLength={10}
              placeholder="SADFROG"
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <Label>Logo color</Label>
          <input
            type="range" min={0} max={359} value={hue}
            onChange={(e) => setHue(Number(e.target.value))}
            className="w-full accent-[var(--brand)]"
            style={{ background: "linear-gradient(90deg,hsl(0 70% 45%),hsl(60 70% 45%),hsl(120 70% 45%),hsl(180 70% 45%),hsl(240 70% 45%),hsl(300 70% 45%),hsl(359 70% 45%))", height: 6, borderRadius: 4, appearance: "none" }}
          />
        </div>

        <div>
          <Label hint="Coins with socials attract more buyers">Socials</Label>
          <div className="flex flex-wrap gap-2">
            {SOCIALS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSocials({ ...socials, [s.key]: !socials[s.key] })}
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  socials[s.key] ? "border-brand bg-brand/15 text-text" : "border-line-2 text-muted hover:text-text"
                }`}
              >
                {socials[s.key] ? "✓ " : ""}{s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label hint="Public coins are on every player's Pulse feed: they can buy it, and get rugged by you">Who can trade it</Label>
          <div className="mb-5 flex flex-wrap gap-2">
            <button
              onClick={() => setIsPublic(true)}
              disabled={!username}
              className={`rounded-md border px-3 py-1.5 text-sm disabled:opacity-40 ${isPublic ? "border-brand bg-brand/15" : "border-line-2 text-muted"}`}
            >
              🌍 Public (all players)
            </button>
            <button
              onClick={() => setIsPublic(false)}
              className={`rounded-md border px-3 py-1.5 text-sm ${!isPublic ? "border-brand bg-brand/15" : "border-line-2 text-muted"}`}
            >
              🔒 Just my market
            </button>
            {!username && <span className="self-center text-xs text-dim">Log in to launch public coins</span>}
          </div>
          <Label hint="Bought in the same transaction as the launch, before any sniper">Dev buy</Label>
          <div className="flex flex-wrap items-center gap-2">
            {DEV_PRESETS.map((p) => (
              <button
                key={p}
                onClick={() => setDevBuy(String(p))}
                className={`num rounded-md border px-3 py-1.5 text-sm ${
                  devBuy === String(p) ? "border-brand text-text" : "border-line-2 text-muted hover:text-text"
                }`}
              >
                {p === 0 ? "None" : p}
              </button>
            ))}
            <label className={`flex w-28 items-center gap-1 rounded-md border bg-bg px-2 py-1.5 text-sm ${devOk ? "border-line-2" : "border-down"}`}>
              <SolIcon size={11} />
              <input inputMode="decimal" value={devBuy} onChange={(e) => setDevBuy(e.target.value)} className="num w-full bg-transparent text-right outline-none" />
            </label>
          </div>
          <div className="num mt-2 text-xs text-muted">
            ≈ {pct(preview.supplyPct, 1)} of supply · starts at MC <Sol size={10}>{mc(preview.mcapUsd)}</Sol>
          </div>
          {preview.supplyPct > 10 && (
            <div className="mt-1 text-xs text-warn">Heads up: traders avoid coins where the dev holds more than ~10%.</div>
          )}
        </div>
      </div>

      <aside className="flex flex-col gap-3 md:pt-12">
        <div className="text-xs font-semibold uppercase tracking-wide text-dim">Preview</div>
        <div className="flex gap-3 rounded-lg border border-line bg-panel p-3">
          <TokenAvatar coin={{ hue, ticker: shownTicker }} size={52} />
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <span className="truncate font-semibold">{shownTicker}</span>
              <span className="truncate text-xs text-muted">{name || "Coin name"}</span>
            </div>
            <div className="num mt-1 text-xs text-muted">
              MC <Sol size={10}>{mc(preview.mcapUsd)}</Sol> · Dev {pct(preview.supplyPct, 1)}
            </div>
          </div>
        </div>

        <div className="num rounded-lg border border-line bg-panel p-3 text-sm">
          <div className="flex justify-between text-muted"><span>Creation fee</span><Sol>{sol(CREATE_FEE_SOL)}</Sol></div>
          <div className="flex justify-between text-muted"><span>Dev buy</span><Sol>{sol(devOk ? dev || 0 : 0)}</Sol></div>
          <div className="mt-1 flex justify-between border-t border-line pt-1 font-semibold"><span>Total</span><Sol>{sol(total)}</Sol></div>
          <div className="mt-1 flex justify-between text-xs text-dim"><span>Your balance</span><Sol size={10}>{sol(m.sol)}</Sol></div>
        </div>

        <button
          disabled={!valid || busy}
          onClick={launch}
          className="rounded-md bg-up py-3 font-bold text-bg disabled:opacity-40"
        >
          {busy ? "Launching…" : `🚀 Launch ${shownTicker}${isPublic ? " for everyone" : ""}`}
        </button>
        {total > m.sol && <div className="text-xs text-down">Not enough SOL.</div>}
        {error && <div className="text-xs text-down">{error}</div>}
      </aside>
    </div>
  );
}
