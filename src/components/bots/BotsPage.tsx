"use client";

import Link from "next/link";
import { useState } from "react";
import { Sol, SolIcon } from "@/components/Sol";
import { age, pct, signed, sol } from "@/lib/format";
import { BOT_LABEL, DEFAULT_BOTS, type BotKind, type BotsConfig, type ExitRules } from "@/lib/sim/bots";
import type { Tier } from "@/lib/sim/social";
import { getBots, updateBots, useMarket } from "@/lib/store";

const INFO: Record<BotKind, { icon: string; what: string; tested: string }> = {
  sniper: {
    icon: "🎯",
    what: "Buys brand-new launches within seconds, if they pass your filters. You race the market's own sniper bots: a higher priority fee lands sooner, and many buys fail on slippage.",
    tested: "Tested over 2 simulated hours: no filters ≈ -4% per SOL (rugs eat you). Bundle ≤ 10–15% and dev ≤ 10% ≈ +15%. The bundle filter matters most.",
  },
  posts: {
    icon: "𝕏",
    what: "Buys the moment an account you follow posts about a coin, before their followers pile in. Other bots watch the same feed, so speed and a quick exit matter.",
    tested: "Tested: about +13–18% per SOL on defaults, ~50% win rate. Holding longer than ~90s usually gives it back.",
  },
  migration: {
    icon: "🎓",
    what: "Buys coins the moment they complete the bonding curve and migrate to the pool.",
    tested: "Tested: about -20% per SOL. Graduation is often the top: early holders sell into the new liquidity. A lesson, not a money printer.",
  },
};

const TIERS: { key: Tier; label: string }[] = [
  { key: "mega", label: "Celebrities" },
  { key: "kol", label: "KOLs" },
  { key: "degen", label: "Degens" },
];

/** Number input that keeps what you type and reports a valid number (or null when empty, if allowed). */
function Num({ label, value, onChange, suffix, isSol, allowEmpty, hint }: {
  label: string; value: number | null; onChange: (v: number | null) => void;
  suffix?: string; isSol?: boolean; allowEmpty?: boolean; hint?: string;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const parsed = text.trim() === "" ? null : Number(text);
  const valid = parsed === null ? !!allowEmpty : Number.isFinite(parsed) && parsed >= 0;
  return (
    <label className="flex items-center justify-between gap-2 text-xs" title={hint}>
      <span className="text-muted">{label}</span>
      <span className={`flex w-28 items-center gap-1 rounded border bg-bg px-2 py-1 ${valid ? "border-line-2" : "border-down"}`}>
        {isSol && <SolIcon size={10} />}
        <input
          inputMode="decimal"
          value={text}
          placeholder={allowEmpty ? "off" : ""}
          onChange={(e) => {
            setText(e.target.value);
            const v = e.target.value.trim() === "" ? null : Number(e.target.value);
            if (v === null ? allowEmpty : Number.isFinite(v) && v >= 0) onChange(v);
          }}
          className="num w-full min-w-0 bg-transparent text-right outline-none placeholder:text-dim"
        />
        {suffix && <span className="text-dim">{suffix}</span>}
      </span>
    </label>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-up" : "bg-line-2"}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

function ExitFields({ exit, set }: { exit: ExitRules; set: (e: ExitRules) => void }) {
  return (
    <>
      <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-dim">Auto-sell (leave empty = off)</div>
      <Num label="Take profit" suffix="%" allowEmpty value={exit.takeProfitPct} onChange={(v) => set({ ...exit, takeProfitPct: v })} />
      <Num label="Stop loss" suffix="%" allowEmpty value={exit.stopLossPct} onChange={(v) => set({ ...exit, stopLossPct: v })} />
      <Num label="Max hold" suffix="s" allowEmpty value={exit.maxHoldSec} onChange={(v) => set({ ...exit, maxHoldSec: v })} />
    </>
  );
}

function BotCard({ kind, cfg, setCfg }: { kind: BotKind; cfg: BotsConfig; setCfg: (c: BotsConfig) => void }) {
  const m = useMarket(1000);
  const bots = getBots();
  const st = bots.stats[kind];
  const c = cfg[kind];
  const set = (patch: Partial<typeof c>) => setCfg({ ...cfg, [kind]: { ...c, ...patch } });
  const holding = [...bots.managed].filter(([id, g]) => g.bot === kind && (m.positions.get(id)?.tokens ?? 0) > 0).length;
  const info = INFO[kind];

  return (
    <section className={`flex flex-col rounded-lg border bg-panel ${c.enabled ? "border-up/50" : "border-line"}`}>
      <div className="flex items-start justify-between gap-3 border-b border-line p-4">
        <div>
          <h2 className="font-bold">{info.icon} {BOT_LABEL[kind]}</h2>
          <p className="mt-1 text-xs leading-snug text-muted">{info.what}</p>
        </div>
        <Toggle on={c.enabled} onChange={(v) => set({ enabled: v })} label={`Run ${BOT_LABEL[kind]}`} />
      </div>

      <div className="num grid grid-cols-4 gap-2 border-b border-line p-3 text-center text-xs">
        <div><div className="text-dim">Buys</div><div className="font-semibold">{st.buys}</div></div>
        <div><div className="text-dim">Failed</div><div className="font-semibold">{st.failed}</div></div>
        <div><div className="text-dim">Win rate</div><div className="font-semibold">{st.closed ? pct((st.wins / st.closed) * 100) : "–"}</div></div>
        <div>
          <div className="text-dim">PnL</div>
          <Sol size={10} className={`font-semibold ${st.pnlSol > 0 ? "text-up" : st.pnlSol < 0 ? "text-down" : ""}`}>
            {signed(st.pnlSol, (x) => sol(x))}
          </Sol>
        </div>
      </div>
      <div className="num flex justify-between px-4 pt-2 text-[11px] text-dim">
        <span>
          {c.enabled ? <span className="text-up">● Running</span> : "○ Off"}
          {holding > 0 && <> · holding {holding}</>}
        </span>
        <span>
          Spent <Sol size={9}>{sol(st.spentSol)}</Sol>
          {c.budgetSol > 0 && <> / {sol(c.budgetSol)}</>}
        </span>
      </div>

      <div className="flex flex-col gap-1.5 p-4">
        <Num label="Buy amount" isSol value={c.buySol} onChange={(v) => v && set({ buySol: v })} />
        <Num label="Budget" isSol allowEmpty hint="Stops buying after spending this much. Empty = no limit"
          value={c.budgetSol || null} onChange={(v) => set({ budgetSol: v ?? 0 })} />
        <Num label="Slippage" suffix="%" value={c.slippagePct} onChange={(v) => v !== null && set({ slippagePct: Math.min(99, v) })} />
        <Num label="Priority fee" isSol value={c.priorityFeeSol} onChange={(v) => v !== null && set({ priorityFeeSol: v })} />

        {kind === "sniper" && (
          <>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-dim">Filters</div>
            <Num label="Max coin age" suffix="s" value={cfg.sniper.maxAgeSec} onChange={(v) => v !== null && set({ maxAgeSec: v })} />
            <Num label="Max dev holding" suffix="%" value={cfg.sniper.maxDevPct} onChange={(v) => v !== null && set({ maxDevPct: v })} />
            <Num label="Max bundle" suffix="%" value={cfg.sniper.maxBundlePct} onChange={(v) => v !== null && set({ maxBundlePct: v })} />
            <Num label="Max launch MC" isSol value={cfg.sniper.maxStartMcapSol} onChange={(v) => v !== null && set({ maxStartMcapSol: v })} />
            <Num label="Max past dev rugs" hint="Skip devs who rugged more coins than this before. 0 = only devs with a clean record"
              value={cfg.sniper.maxDevRugs} onChange={(v) => v !== null && set({ maxDevRugs: Math.floor(v) })} />
            <label className="flex items-center justify-between text-xs">
              <span className="text-muted">Require socials</span>
              <Toggle on={cfg.sniper.requireSocials} onChange={(v) => set({ requireSocials: v })} label="Require socials" />
            </label>
          </>
        )}

        {kind === "posts" && (
          <>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-dim">Follow posts from</div>
            <div className="flex flex-wrap gap-1">
              {TIERS.map((t) => {
                const on = cfg.posts.tiers.includes(t.key);
                return (
                  <button
                    key={t.key}
                    onClick={() => set({ tiers: on ? cfg.posts.tiers.filter((x) => x !== t.key) : [...cfg.posts.tiers, t.key] })}
                    className={`rounded-md border px-2 py-1 text-xs ${on ? "border-brand bg-brand/15" : "border-line-2 text-muted"}`}
                  >
                    {on ? "✓ " : ""}{t.label}
                  </button>
                );
              })}
            </div>
          </>
        )}

        <ExitFields exit={c.exit} set={(e) => set({ exit: e })} />
        <p className="mt-2 rounded bg-bg p-2 text-[11px] leading-snug text-dim">📊 {info.tested}</p>
      </div>
    </section>
  );
}

function ActivityLog() {
  const m = useMarket(500);
  const log = getBots().log.slice(0, 40);
  const tone = { buy: "text-brand", good: "text-up", bad: "text-down", info: "text-muted" };
  return (
    <section className="rounded-lg border border-line bg-panel">
      <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">Activity</h2>
      {log.length === 0 ? (
        <p className="p-6 text-center text-sm text-dim">Nothing yet. Turn a bot on and it will report here.</p>
      ) : (
        <ul className="max-h-96 overflow-y-auto text-xs">
          {log.map((l) => (
            <li key={l.id} className="flex gap-3 border-t border-line px-4 py-2 first:border-t-0">
              <span className="num w-10 shrink-0 text-dim">{age(m.time - l.t)}</span>
              <span className="w-28 shrink-0 text-muted">{BOT_LABEL[l.bot]}</span>
              <span className={`min-w-0 flex-1 ${tone[l.tone]}`}>
                {l.text}
                {l.coinId && m.coins.has(l.coinId) && (
                  <Link href={`/coin/${l.coinId}`} className="ml-2 text-dim underline hover:text-text">view</Link>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function BotsPage() {
  const [cfg, setCfgState] = useState<BotsConfig>(() => structuredClone(getBots().config));
  const [resets, setResets] = useState(0); // remounts the inputs after a reset
  const setCfg = (c: BotsConfig) => {
    setCfgState(c);
    updateBots(c);
  };
  const anyOn = cfg.sniper.enabled || cfg.posts.enabled || cfg.migration.enabled;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">🤖 Bots</h1>
          <p className="text-sm text-muted">
            Automate your trading. Bots use your balance and run while this tab is open. Changes apply instantly.
          </p>
        </div>
        <div className="flex gap-2">
          {anyOn && (
            <button
              onClick={() => setCfg({
                sniper: { ...cfg.sniper, enabled: false },
                posts: { ...cfg.posts, enabled: false },
                migration: { ...cfg.migration, enabled: false },
              })}
              className="rounded-md bg-down px-3 py-1.5 text-sm font-semibold text-bg"
            >
              Stop all
            </button>
          )}
          <button
            onClick={() => {
              setCfg(structuredClone(DEFAULT_BOTS));
              setResets((r) => r + 1);
            }}
            className="rounded-md border border-line-2 px-3 py-1.5 text-sm text-muted hover:text-text"
            title="Restore default settings (turns all bots off)"
          >
            Reset settings
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {(["sniper", "posts", "migration"] as const).map((k) => (
          <BotCard key={`${k}-${resets}`} kind={k} cfg={cfg} setCfg={setCfg} />
        ))}
      </div>
      <ActivityLog />
      <p className="text-xs text-dim">
        Tip: you can also set take profit / stop loss on any coin you hold, from the coin page.
      </p>
    </div>
  );
}
