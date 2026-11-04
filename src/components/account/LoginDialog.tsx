"use client";

import { useState } from "react";
import { login } from "@/lib/account";

const VALID = /^[A-Za-z0-9_]{3,16}$/;

export function LoginDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const valid = VALID.test(name.trim());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      await login(name);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log in");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg border border-line-2 bg-panel p-5 shadow-2xl"
      >
        <h2 className="text-lg font-bold">Pick a username</h2>
        <p className="mt-1 text-sm text-muted">
          No password needed. It puts you on the leaderboard. Typing a name that already exists logs you in as that player.
        </p>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. degen_tijeen"
          maxLength={16}
          className="mt-4 w-full rounded-md border border-line-2 bg-bg px-3 py-2 outline-none focus:border-brand"
        />
        <div className="mt-1 h-4 text-xs text-dim">
          {error ? <span className="text-down">{error}</span> : name && !valid ? "3–16 letters, numbers or _" : ""}
        </div>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md px-3 py-2 text-sm text-muted hover:text-text">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!valid || busy}
            className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? "…" : "Let's go"}
          </button>
        </div>
      </form>
    </div>
  );
}
