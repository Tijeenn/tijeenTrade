/** Trading defaults, editable on /settings and kept in this browser. */
export interface Settings {
  startSol: number;
  quickBuySol: number;
  buyPresets: number[];
  sellPresets: number[];
  slippagePct: number;
  priorityFeeSol: number;
  sound: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  startSol: 10,
  quickBuySol: 0.5,
  buyPresets: [0.1, 0.5, 1, 5],
  sellPresets: [10, 25, 50, 100],
  slippagePct: 20,
  priorityFeeSol: 0.001,
  sound: true,
};

const KEY = "tijeen.settings.v1";

function load(): Settings {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null;
    return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Live settings object; read it at render time. */
export const SETTINGS: Settings = load();

export function updateSettings(patch: Partial<Settings>): void {
  Object.assign(SETTINGS, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(SETTINGS));
  } catch {
    // storage unavailable (private mode): settings just won't persist
  }
}
