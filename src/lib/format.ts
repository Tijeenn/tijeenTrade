import { SOL_USD } from "./sim/curve";

const compact = (n: number, digits = 1) => {
  const a = Math.abs(n);
  if (a >= 1e9) return (n / 1e9).toFixed(digits) + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(digits) + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(digits) + "K";
  return n.toFixed(a < 10 && digits > 0 ? digits : 0);
};

export const usd = (n: number, digits = 1) => "$" + compact(n, digits);
export const tokens = (n: number) => compact(n, 2);
export const solToUsd = (sol: number) => sol * SOL_USD;

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
