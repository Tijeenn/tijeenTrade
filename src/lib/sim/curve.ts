/**
 * pump.fun-style bonding curve, then a constant-product pool after graduation.
 * Both phases are x*y=k on (rSol, rTok); on the curve those reserves are virtual.
 */
export const TOTAL_SUPPLY = 1_000_000_000;
export const CURVE_TOKENS = 793_100_000; // tokens sellable on the curve
export const INIT_V_SOL = 30;
export const INIT_V_TOK = 1_073_000_000;
export const CURVE_FEE = 0.01;
export const POOL_FEE = 0.0025;
export const SOL_USD = 150;

export type Phase = "curve" | "graduated";

export interface Reserves {
  phase: Phase;
  rSol: number;
  rTok: number;
  tokensSold: number;
  realSol: number; // SOL actually deposited on the curve
}

export interface BuyQuote {
  tokensOut: number;
  solUsed: number; // includes fee
  fee: number;
}

export interface SellQuote {
  solOut: number; // after fee
  gross: number;
  fee: number;
}

export function newReserves(): Reserves {
  return { phase: "curve", rSol: INIT_V_SOL, rTok: INIT_V_TOK, tokensSold: 0, realSol: 0 };
}

export const feeRate = (r: Reserves) => (r.phase === "curve" ? CURVE_FEE : POOL_FEE);
export const price = (r: Reserves) => r.rSol / r.rTok; // SOL per token
export const mcapSol = (r: Reserves) => price(r) * TOTAL_SUPPLY;
export const mcapUsd = (r: Reserves) => mcapSol(r) * SOL_USD;
export const bondingProgress = (r: Reserves) =>
  r.phase === "graduated" ? 1 : r.tokensSold / CURVE_TOKENS;

export function quoteBuy(r: Reserves, solIn: number): BuyQuote {
  const f = feeRate(r);
  let net = solIn * (1 - f);
  const k = r.rSol * r.rTok;
  let tokensOut = r.rTok - k / (r.rSol + net);
  if (r.phase === "curve") {
    const left = CURVE_TOKENS - r.tokensSold;
    if (tokensOut > left) {
      tokensOut = left;
      net = k / (r.rTok - tokensOut) - r.rSol;
    }
  }
  const solUsed = net / (1 - f);
  return { tokensOut, solUsed, fee: solUsed - net };
}

export function quoteSell(r: Reserves, tokIn: number): SellQuote {
  const k = r.rSol * r.rTok;
  const gross = r.rSol - k / (r.rTok + tokIn);
  const fee = gross * feeRate(r);
  return { solOut: gross - fee, gross, fee };
}

export function applyBuy(r: Reserves, q: BuyQuote): void {
  const net = q.solUsed - q.fee;
  r.rSol += net;
  r.rTok -= q.tokensOut;
  r.tokensSold += q.tokensOut;
  r.realSol += net;
}

export function applySell(r: Reserves, tokIn: number, q: SellQuote): void {
  r.rSol -= q.gross;
  r.rTok += tokIn;
  r.tokensSold -= tokIn;
  r.realSol -= q.gross;
}

/** Curve complete: move liquidity into a real pool at the same price. */
export function shouldGraduate(r: Reserves): boolean {
  return r.phase === "curve" && r.tokensSold >= CURVE_TOKENS - 1;
}

export function graduate(r: Reserves): void {
  const p = price(r);
  r.phase = "graduated";
  r.rSol = r.realSol;
  r.rTok = r.realSol / p;
}
