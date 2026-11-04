"use client";

import { SETTINGS } from "./settings";

/** Tiny synthesized sound effects (no audio files). Silent until the user has interacted. */
let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (!SETTINGS.sound || typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = "sine", vol = 0.08, endFreq?: number) {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const gain = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export const sfx = {
  buy: () => tone(660, 0, 0.09, "triangle", 0.07, 990),
  win: () => {
    tone(784, 0, 0.1, "triangle");
    tone(1047, 0.08, 0.16, "triangle");
  },
  bigWin: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.07, 0.18, "triangle", 0.09)),
  loss: () => tone(330, 0, 0.22, "sine", 0.08, 196),
  rug: () => {
    tone(880, 0, 0.5, "sawtooth", 0.05, 110);
    tone(440, 0.05, 0.45, "square", 0.03, 70);
  },
  fail: () => {
    tone(200, 0, 0.08, "square", 0.05);
    tone(160, 0.1, 0.1, "square", 0.05);
  },
  alert: () => {
    tone(1318, 0, 0.07, "sine", 0.06);
    tone(1760, 0.09, 0.1, "sine", 0.06);
  },
  launch: () => tone(220, 0, 0.6, "triangle", 0.08, 1760),
};
