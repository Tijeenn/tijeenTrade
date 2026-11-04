"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Sol, SolIcon } from "@/components/Sol";
import { age, sol } from "@/lib/format";
import { syncScore } from "@/lib/account";
import { sfx } from "@/lib/sound";
import { DEFAULT_SETTINGS, SETTINGS, updateSettings, type Settings } from "@/lib/settings";
import { getMarket, getRun, resetRun, wallMs } from "@/lib/store";

const MAX_START_SOL = 1_000_000;

type Form = Record<"quickBuySol" | "slippagePct" | "priorityFeeSol", string> & {
  buyPresets: string[];
  sellPresets: string[];
};

const toForm = (s: Settings): Form => ({
  quickBuySol: String(s.quickBuySol),
  slippagePct: String(s.slippagePct),
  priorityFeeSol: String(s.priorityFeeSol),
  buyPresets: s.buyPresets.map(String),
  sellPresets: s.sellPresets.map(String),
});

const positive = (v: string) => Number.isFinite(Number(v)) && Number(v) > 0;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-dim">{hint}</div>}
      </div>
      <div className="flex gap-1">{children}</div>
    </div>
  );
}

function Input({ value, onChange, suffix, sol: isSol, invalid }: {
  value: string; onChange: (v: string) => void; suffix?: string; sol?: boolean; invalid?: boolean;
}) {
  return (
    <label className={`flex w-24 items-center gap-1 rounded border bg-bg px-2 py-1.5 text-sm ${invalid ? "border-down" : "border-line-2"}`}>
      {isSol && <SolIcon size={11} />}
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="num w-full min-w-0 bg-transparent text-right outline-none"
      />
      {suffix && <span className="text-xs text-dim">{suffix}</span>}
    </label>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-panel">
      <h2 className="border-b border-line px-4 py-3 text-sm font-semibold">{title}</h2>
      <div className="flex flex-col gap-4 p-4">{children}</div>
    </section>
  );
}

function NewRun() {
  const router = useRouter();
  const m = getMarket();
  const run = getRun();
  const [amount, setAmount] = useState(String(SETTINGS.startSol));
  const [confirming, setConfirming] = useState(false);
  const valid = positive(amount) && Number(amount) <= MAX_START_SOL;

  const start = () => {
    if (!confirming) return setConfirming(true);
    const n = Number(amount);
    updateSettings({ startSol: n });
    resetRun(n);
    syncScore().catch(() => {}); // the leaderboard shows the new run right away
    router.push("/");
  };

  return (
    <Section title="Wallet">
      <p className="text-xs text-muted">
        Current run: started {age(wallMs(m.time) - run.startedAt)} ago with <Sol>{sol(m.startSol)}</Sol>. Starting a new run
        sets your balance and wipes your positions, history and PnL.
      </p>
      <Field label="Starting balance" hint={`Any amount up to ${MAX_START_SOL.toLocaleString()} SOL`}>
        <Input value={amount} onChange={(v) => { setAmount(v); setConfirming(false); }} sol invalid={!valid} />
      </Field>
      <div className="flex justify-end gap-2">
        {confirming && (
          <button onClick={() => setConfirming(false)} className="rounded-md px-3 py-2 text-sm text-muted hover:text-text">
            Cancel
          </button>
        )}
        <button
          disabled={!valid}
          onClick={start}
          className={`rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-40 ${
            confirming ? "bg-down text-bg" : "bg-brand text-white"
          }`}
        >
          {confirming ? "Yes, wipe and restart" : "Start new run"}
        </button>
      </div>
    </Section>
  );
}

function SoundToggle() {
  const [on, setOn] = useState(SETTINGS.sound);
  return (
    <Section title="Sound">
      <Field label="Sound effects" hint="Buys, wins, losses, rugs and alerts">
        <button
          role="switch"
          aria-checked={on}
          aria-label="Sound effects"
          onClick={() => {
            updateSettings({ sound: !on });
            setOn(!on);
            if (!on) sfx.win();
          }}
          className={`relative h-6 w-11 rounded-full transition-colors ${on ? "bg-up" : "bg-line-2"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
        </button>
      </Field>
    </Section>
  );
}

export function SettingsForm() {
  const [f, setF] = useState<Form>(() => toForm(SETTINGS));
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<Form>) => {
    setF({ ...f, ...patch });
    setSaved(false);
  };
  const setPreset = (key: "buyPresets" | "sellPresets", i: number, v: string) =>
    set({ [key]: f[key].map((x, j) => (j === i ? v : x)) });

  const sellOk = (v: string) => positive(v) && Number(v) <= 100;
  const valid =
    positive(f.quickBuySol) &&
    Number.isFinite(Number(f.slippagePct)) && Number(f.slippagePct) >= 0 && Number(f.slippagePct) <= 100 &&
    Number.isFinite(Number(f.priorityFeeSol)) && Number(f.priorityFeeSol) >= 0 &&
    f.buyPresets.every(positive) && f.sellPresets.every(sellOk);

  const saveAll = () => {
    updateSettings({
      quickBuySol: Number(f.quickBuySol),
      slippagePct: Number(f.slippagePct),
      priorityFeeSol: Number(f.priorityFeeSol),
      buyPresets: f.buyPresets.map(Number),
      sellPresets: f.sellPresets.map(Number),
    });
    setSaved(true);
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4">
      <h1 className="text-xl font-bold">Settings</h1>
      <NewRun />
      <SoundToggle />
      <Section title="Trading">
        <Field label="Quick buy amount" hint="The ⚡ button on Pulse">
          <Input value={f.quickBuySol} onChange={(v) => set({ quickBuySol: v })} sol invalid={!positive(f.quickBuySol)} />
        </Field>
        <Field label="Buy presets">
          {f.buyPresets.map((v, i) => (
            <Input key={i} value={v} onChange={(x) => setPreset("buyPresets", i, x)} sol invalid={!positive(v)} />
          ))}
        </Field>
        <Field label="Sell presets" hint="Percent of your bag">
          {f.sellPresets.map((v, i) => (
            <Input key={i} value={v} onChange={(x) => setPreset("sellPresets", i, x)} suffix="%" invalid={!sellOk(v)} />
          ))}
        </Field>
        <Field label="Slippage" hint="Order fails if the price moves more than this before it lands">
          <Input value={f.slippagePct} onChange={(v) => set({ slippagePct: v })} suffix="%" />
        </Field>
        <Field label="Priority fee" hint="Paid on every order, even failed ones. Higher lands faster">
          <Input value={f.priorityFeeSol} onChange={(v) => set({ priorityFeeSol: v })} sol />
        </Field>
        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-xs text-up">Saved</span>}
          <button
            onClick={() => { setF(toForm(DEFAULT_SETTINGS)); setSaved(false); }}
            className="rounded-md px-3 py-2 text-sm text-muted hover:text-text"
          >
            Reset to defaults
          </button>
          <button
            disabled={!valid}
            onClick={saveAll}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </Section>
    </div>
  );
}
