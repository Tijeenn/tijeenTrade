"use client";

import { useSyncExternalStore } from "react";

/** Tiny persisted stores for UI preferences (watchlist, Pulse filters). */
function persisted<T>(key: string, initial: T) {
  let value: T = initial;
  let loaded = false;
  const listeners = new Set<() => void>();
  const load = () => {
    if (loaded || typeof localStorage === "undefined") return;
    loaded = true;
    try {
      const raw = localStorage.getItem(key);
      if (raw) value = { ...initial, ...JSON.parse(raw) };
    } catch {
      /* ignore */
    }
  };
  return {
    get(): T {
      load();
      return value;
    },
    set(next: T) {
      value = next;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      listeners.forEach((l) => l());
    },
    use(): T {
      return useSyncExternalStore(
        (l) => {
          listeners.add(l);
          return () => listeners.delete(l);
        },
        () => this.get(),
        () => initial,
      );
    },
  };
}

// ---------- watchlist ----------

const watch = persisted<{ ids: string[] }>("tijeen.watchlist.v1", { ids: [] });

export function useWatchlist(): Set<string> {
  const v = watch.use();
  return new Set(v.ids);
}

export function toggleWatch(coinId: string) {
  const ids = watch.get().ids;
  watch.set({ ids: ids.includes(coinId) ? ids.filter((x) => x !== coinId) : [...ids, coinId].slice(-200) });
}

// ---------- Pulse filters ----------

export interface PulseFilters {
  search: string;
  watchOnly: boolean;
  socials: boolean;
  noBundles: boolean; // bundle <= 10%
  cleanDev: boolean; // dev never rugged before
  metaOnly: boolean;
  minMcSol: number;
}

export const NO_FILTERS: PulseFilters = {
  search: "", watchOnly: false, socials: false, noBundles: false, cleanDev: false, metaOnly: false, minMcSol: 0,
};

const filters = persisted<PulseFilters>("tijeen.pulseFilters.v1", NO_FILTERS);
export const usePulseFilters = () => filters.use();
export const setPulseFilters = (f: PulseFilters) => filters.set(f);
