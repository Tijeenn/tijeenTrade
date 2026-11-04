import { SOL_USD } from "./sim/curve";

/** 1234 -> "1.2K". Small numbers keep a few decimals. */
export function compact(n: number, digits = 1): string {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(digits) + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(digits) + "M";
  if (a >= 1e4) return (n / 1e3).toFixed(digits) + "K";
  if (a >= 100) return n.toFixed(0);
  if (a >= 1) return n.toFixed(Math.max(digits, 1));
  return n.toFixed(3);
}

/** The engine prices in USD internally; everything is shown in SOL. */
export const usdToSol = (usd: number) => usd / SOL_USD;
/** Market cap (given in USD by the engine) as a compact SOL string. */
export const mc = (mcapUsd: number, digits = 1) => compact(usdToSol(mcapUsd), digits);

export const tokens = (n: number) => compact(n, 2);

export function sol(n: number, digits?: number): string {
  const d = digits ?? (Math.abs(n) >= 100 ? 1 : Math.abs(n) >= 1 ? 2 : 3);
  return n.toFixed(d);
}

export function signed(n: number, f: (x: number) => string): string {
  return (n > 0 ? "+" : n < 0 ? "-" : "") + f(Math.abs(n));
}

export const pct = (n: number, digits = 0) => n.toFixed(n !== 0 && Math.abs(n) < 1 ? 1 : digits) + "%";

export function age(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return s + "s";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  return Math.floor(s / 86400) + "d";
}

export const shortAddr = (a: string) => a.slice(0, 4) + "…" + a.slice(-4);
