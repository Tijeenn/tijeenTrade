import { mcapUsd, SOL_USD } from "./curve";
import type { Coin, Market } from "./market";
import { NOUN } from "./names";
import { Rng } from "./rng";
import { coinStats } from "./stats";
import { REPLIES, REPLY_HANDLES, VOICES } from "./voices";

/**
 * Simulated crypto Twitter. Every account is a fictional parody. Posts can move coins:
 * celebrity posts pump coins whose name matches a word they post, KOLs shill tickers,
 * and your own posts send your followers into the coins you mention.
 */

export type Tier = "mega" | "kol" | "degen" | "news";

export interface Account {
  id: string; // handle
  name: string;
  tier: Tier;
  followers: number;
  hue: number;
  parody: boolean; // a joke version of a real public figure
}

export const ACCOUNTS: Account[] = [
  { id: "elontusk", name: "Elon Tusk", tier: "mega", followers: 212_000_000, hue: 210, parody: true },
  { id: "realDonaldRump", name: "Donald Rump", tier: "mega", followers: 98_000_000, hue: 20, parody: true },
  { id: "mrfeast", name: "Mr. Feast", tier: "mega", followers: 41_000_000, hue: 195, parody: true },
  { id: "kanyewaste", name: "Kanye Waste", tier: "mega", followers: 32_000_000, hue: 0, parody: true },
  { id: "snoopdogecoin", name: "Snoop Dogecoin", tier: "mega", followers: 22_000_000, hue: 45, parody: true },
  { id: "vitalikbutter", name: "Vitalik Butterin", tier: "kol", followers: 5_600_000, hue: 260, parody: true },
  { id: "saylormoon", name: "Saylor Moon", tier: "kol", followers: 3_900_000, hue: 30, parody: true },
  { id: "cobiewan", name: "Cobie Wan", tier: "kol", followers: 900_000, hue: 150, parody: true },
  { id: "ansemble", name: "Anon Sem", tier: "kol", followers: 680_000, hue: 280, parody: true },
  { id: "gcrghost", name: "GCR Ghost", tier: "kol", followers: 520_000, hue: 300, parody: true },
  { id: "muradmemes", name: "Murad Memes", tier: "kol", followers: 410_000, hue: 120, parody: true },
  { id: "solsensei", name: "Solana Sensei", tier: "degen", followers: 140_000, hue: 170, parody: false },
  { id: "degenintern", name: "degen intern", tier: "degen", followers: 85_000, hue: 330, parody: false },
  { id: "rugdetective", name: "rug detective 🔍", tier: "degen", followers: 60_000, hue: 90, parody: false },
  { id: "wifhatguy", name: "wif hat guy", tier: "degen", followers: 33_000, hue: 15, parody: false },
  { id: "jeethunter", name: "jeet hunter", tier: "degen", followers: 21_000, hue: 240, parody: false },
  { id: "pumpalerts", name: "Pump Alerts 🚨", tier: "news", followers: 310_000, hue: 140, parody: false },
  { id: "rugwatch", name: "Rug Watch", tier: "news", followers: 190_000, hue: 350, parody: false },
];

const ACCOUNT_BY_ID = new Map(ACCOUNTS.map((a) => [a.id, a]));
export const getAccount = (id: string) => ACCOUNT_BY_ID.get(id);
const byTier = (t: Tier) => ACCOUNTS.filter((a) => a.tier === t);


export type TweetKind =
  | "chatter" | "shill" | "keyword" | "warning" | "clean" | "whale" | "rug" | "gainer" | "grad" | "meta" | "mention" | "you";

export interface Reply {
  handle: string;
  text: string;
}

export interface Tweet {
  id: number;
  t: number; // sim ms
  author: string; // account id, or "you"
  kind?: TweetKind; // older saves don't have it
  text: string; // may contain {you}, replaced with your handle when shown
  links: Record<string, string>; // TICKER -> coinId, for clickable $TICKERs
  pumped?: { coinId: string; ticker: string }[]; // coins a celebrity post hit
  pnl?: { ticker: string; pnlSol: number; pnlPct: number }; // attached PnL card
  likes: number;
  reposts: number;
  views: number;
  replies?: Reply[];
  // your posts only: what it did
  gained?: number; // followers gained
  apes?: number; // followers who bought the coins you mentioned
}

/** Things worth a pop-up: a celebrity post that moved coins, or how one of your calls went. */
export interface SocialAlert {
  id: number;
  text: string;
  tone: "good" | "bad" | "info";
  coinId?: string;
}

interface Shill {
  coinId: string;
  ticker: string;
  mcapUsd: number;
  evalAt: number; // sim ms
}

export interface SocialSave {
  followers: number;
  posts: (Tweet & { ageMs: number })[];
}

const MAX_FEED = 150;
const MAX_TEXT = 280;
export const POST_COOLDOWN_MS = 10_000;
const SHILL_EVAL_MS = 180_000;
const START_FOLLOWERS = 25;
const WHALE_SOL = 6; // a buy this big gets a whale alert
const WHALE_COOLDOWN_MS = 30_000;

const META_EARLY = ["{WORD} SZN. aping every {word} coin I see", "{word} meta is so back 🔥", "if it has {word} in the name I'm buying",
  "you're still early on the {word} meta", "{word} coins only today"];
const META_LATE = ["{word} meta is getting crowded. late buyers = exit liquidity", "sold my {word} bags. too many copycats",
  "{word} szn is over, what's next?", "every dev launched a {word} coin today. that's the top"];
const MENTION_GOOD = ["{you} what are you buying next?", "following {you}'s calls now 👀", "{you} called it again",
  "who is {you} and why are they always early", "{you} ser drop the next one"];
const MENTION_BAD = ["{you} rugged me 😭", "never trusting {you}'s calls again", "{you} shilled me the top"];

/** Fill {T} {mc} {x} {holders} {word} {Word} {WORD}; {you} stays for the UI. */
function fill(tpl: string, v: Record<string, string>): string {
  return tpl.replace(/\{(\w+)\}/g, (m, k: string) => (k === "you" ? m : k === "T" ? "$" + v.T : v[k] ?? m));
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const wordVars = (w: string) => ({ word: w.toLowerCase(), Word: cap(w.toLowerCase()), WORD: w.toUpperCase() });

function coinVars(c: Coin): Record<string, string> {
  const mc = mcapUsd(c.r) / SOL_USD;
  return {
    T: c.ticker,
    mc: mc >= 1000 ? (mc / 1000).toFixed(1) + "K" : mc.toFixed(0),
    x: (mcapUsd(c.r) / c.startMcap).toFixed(1) + "x",
    holders: String(c.holders.size),
  };
}

export class Social {
  rng: Rng;
  feed: Tweet[] = []; // newest first
  alerts: SocialAlert[] = [];
  followers = START_FOLLOWERS;
  lastPostAt = -Infinity;
  private shills: Shill[] = [];
  private lastCall: "good" | "bad" | null = null;
  private nextTweetAt = 0;
  private nextId = 1;
  private lastScan = 0;
  private lastWhaleAt = -Infinity;
  private called = new Set<string>(); // coins the rug detective already posted about

  constructor(seed: number) {
    this.rng = new Rng(seed);
  }

  /** Call after every market step. Bots post, news reacts, your calls get judged. */
  step(m: Market): void {
    const rng = this.rng;
    if (this.nextTweetAt === 0) this.nextTweetAt = m.time + 2000;
    while (m.time >= this.nextTweetAt) {
      this.botTweet(m);
      this.nextTweetAt += rng.range(4, 10) * 1000;
    }
    this.news(m);
    this.judgeShills(m);
    this.lastScan = m.time;
  }

  // ---------- bots ----------

  private botTweet(m: Market) {
    const rng = this.rng;
    const live = [...m.coins.values()].filter((c) => !c.dead && c.ruggedAt === undefined);
    const kind = rng.weighted({
      persona: 0.62,
      detective: 0.14,
      gainer: 0.08,
      meta: m.meta ? 0.1 : 0,
      mention: this.followers >= 300 ? 0.06 : 0,
    });
    if (kind === "detective" && this.detective(m, live)) return;
    if (kind === "gainer" && this.gainer(m, live)) return;
    if (kind === "meta" && m.meta) return this.metaTalk(m);
    if (kind === "mention") return this.mention(m);
    this.persona(m, live);
  }

  /** A celebrity, KOL or degen posting in their own voice; sometimes about a coin. */
  private persona(m: Market, live: Coin[]) {
    const rng = this.rng;
    const tier = rng.weighted({ mega: 0.2, kol: 0.38, degen: 0.42 });
    const pool = byTier(tier).filter((a) => a.id !== this.feed[0]?.author && a.id !== "rugdetective");
    const acc = rng.pick(pool);
    const v = VOICES[acc.id];
    if (tier === "mega" && v.keyword && rng.chance(0.4)) return this.keywordTweet(m, acc, live, v.keyword);

    const shillChance = tier === "kol" ? 0.45 : tier === "degen" ? 0.3 : 0;
    const candidates = live.filter((c) => {
      const age = m.time - c.createdAt;
      return age > 15_000 && age < 15 * 60_000;
    });
    if (v.shill && candidates.length && rng.chance(shillChance)) {
      const c = rng.pick(candidates);
      const reach = Math.log10(acc.followers);
      m.hype(c.id, {
        strength: tier === "kol" ? rng.range(0.15, 0.45) : rng.range(0.05, 0.15),
        buyers: Math.round((tier === "kol" ? rng.range(5, 18) : rng.range(2, 6)) * (reach / 6)),
        avgBuySol: tier === "kol" ? 0.4 : 0.2,
        by: acc.id,
      });
      const text = fill(rng.pick(v.shill), coinVars(c));
      return this.push({ author: acc.id, kind: "shill", text, links: { [c.ticker]: c.id } }, acc.followers, m.time);
    }
    this.push({ author: acc.id, kind: "chatter", text: rng.pick(v.chatter), links: {} }, acc.followers, m.time);
  }

  /** A celebrity posts a word. Every live coin with that word in its name goes vertical. */
  private keywordTweet(m: Market, acc: Account, live: Coin[], templates: string[]) {
    const rng = this.rng;
    // Usually a word some live coin uses, so something actually pumps.
    let word = rng.pick(NOUN).toLowerCase();
    if (live.length && rng.chance(0.7)) {
      const words = rng.pick(live).name.split(/\s+/).filter((w) => NOUN.includes(w));
      if (words.length) word = rng.pick(words).toLowerCase();
    }
    const hits = live
      .filter((c) => c.name.toLowerCase().includes(word) || c.ticker.toLowerCase().includes(word.replace(/\s/g, "")))
      .slice(0, 5);
    for (const c of hits) {
      m.hype(c.id, { strength: rng.range(1, 1.8), buyers: rng.int(25, 70), avgBuySol: 0.5, by: acc.id });
    }
    const text = fill(rng.pick(templates), wordVars(word));
    const pumped = hits.map((c) => ({ coinId: c.id, ticker: c.ticker }));
    this.push({ author: acc.id, kind: "keyword", text, links: {}, pumped }, acc.followers, m.time);
    if (hits.length) {
      this.alert(`${acc.name} posted "${text}". ${hits.map((c) => "$" + c.ticker).join(" ")} ${hits.length > 1 ? "are" : "is"} going vertical 🚀`, "info", hits[0].id);
    }
  }

  /** The rug detective reads the real on-chain signals. Warnings make people sell. */
  private detective(m: Market, live: Coin[]): boolean {
    const rng = this.rng;
    const acc = getAccount("rugdetective")!;
    const fresh = live.filter((c) => {
      const age = m.time - c.createdAt;
      return c.r.phase === "curve" && !c.mine && !this.called.has(c.id) && age > 10_000 && age < 4 * 60_000;
    });
    const scored = fresh.map((c) => ({ c, s: coinStats(c, m.time) }));
    const bad = scored.filter(({ s }) => s.bundlePct > 20 || s.devPrevRugs >= 2 || s.top10Pct > 45);
    const clean = scored.filter(({ s }) => s.bundlePct === 0 && s.devPct < 3 && s.devPrevRugs === 0 && s.devPrevMigrations > 0);
    if (bad.length && (rng.chance(0.75) || !clean.length)) {
      const { c, s } = rng.pick(bad);
      this.remember(c.id);
      const why = [
        s.bundlePct > 20 && `${s.bundlePct.toFixed(0)}% bundled`,
        s.devPrevRugs >= 2 && `dev rugged ${s.devPrevRugs} coins before`,
        s.top10Pct > 45 && `top 10 wallets hold ${s.top10Pct.toFixed(0)}%`,
      ].filter(Boolean).join(", ");
      m.hype(c.id, { strength: -0.35, buyers: 0, avgBuySol: 0, by: acc.id });
      this.push({ author: acc.id, kind: "warning", text: `⚠️ $${c.ticker}: ${why}. You are the exit liquidity. Stay away`, links: { [c.ticker]: c.id } }, acc.followers, m.time);
      return true;
    }
    if (clean.length) {
      const { c, s } = rng.pick(clean);
      this.remember(c.id);
      m.hype(c.id, { strength: 0.15, buyers: 4, avgBuySol: 0.3, by: acc.id });
      const mig = s.devPrevMigrations;
      this.push({
        author: acc.id, kind: "clean",
        text: `✅ $${c.ticker} checks out: dev holds ${s.devPct.toFixed(1)}%, no bundles, dev has ${mig} migrated coin${mig > 1 ? "s" : ""}. Not financial advice`,
        links: { [c.ticker]: c.id },
      }, acc.followers, m.time);
      return true;
    }
    return false;
  }

  private gainer(m: Market, live: Coin[]): boolean {
    const recent = live.filter((c) => m.time - c.createdAt < 15 * 60_000);
    const best = recent.sort((a, b) => mcapUsd(b.r) / b.startMcap - mcapUsd(a.r) / a.startMcap)[0];
    if (!best || mcapUsd(best.r) / best.startMcap < 3) return false;
    const acc = getAccount("pumpalerts")!;
    const v = coinVars(best);
    this.push({
      author: acc.id, kind: "gainer",
      text: `📈 Top gainer (last 15m): $${best.ticker} ${v.x} · ${v.mc} SOL MC · ${v.holders} holders`,
      links: { [best.ticker]: best.id },
    }, acc.followers, m.time);
    return true;
  }

  private metaTalk(m: Market) {
    const rng = this.rng;
    const meta = m.meta!;
    const late = (m.time - meta.startedAt) / (meta.until - meta.startedAt) > 0.6;
    const acc = rng.pick([...byTier("kol"), ...byTier("degen")].filter((a) => a.id !== "rugdetective"));
    const text = fill(rng.pick(late ? META_LATE : META_EARLY), wordVars(meta.word));
    this.push({ author: acc.id, kind: "meta", text, links: {} }, acc.followers, m.time);
  }

  /** Once you have a following, people talk about you. */
  private mention(m: Market) {
    const rng = this.rng;
    const acc = rng.pick(byTier("degen").filter((a) => a.id !== "rugdetective"));
    const text = rng.pick(this.lastCall === "bad" && rng.chance(0.6) ? MENTION_BAD : MENTION_GOOD);
    this.push({ author: acc.id, kind: "mention", text, links: {} }, acc.followers, m.time);
  }

  /** Alert bots react to metas, graduations, rugs and whale buys. */
  private news(m: Market) {
    if (!this.lastScan) return;
    const rng = this.rng;
    const alerts = getAccount("pumpalerts")!;
    if (m.meta && m.meta.startedAt > this.lastScan) {
      const w = m.meta.word;
      this.push({ author: alerts.id, kind: "meta", text: `🔥 ${w.toUpperCase()} SEASON. ${w} coins are ripping, devs are launching copycats every few seconds. Don't be the last one in`, links: {} }, alerts.followers, m.time);
      this.alert(`New meta: ${w.toUpperCase()} coins are pumping. Early is everything, late is exit liquidity`, "info");
    }
    let whale: { c: Coin; sol: number; kol: boolean } | undefined;
    for (const c of m.coins.values()) {
      if (c.graduatedAt !== undefined && c.graduatedAt > this.lastScan && rng.chance(0.8)) {
        this.push({
          author: alerts.id, kind: "grad",
          text: `🎓 $${c.ticker} just completed its bonding curve at ${coinVars(c).mc} SOL MC and migrated to the pool`,
          links: { [c.ticker]: c.id },
        }, alerts.followers, m.time);
      }
      const rugMs = c.plan.rugAt !== undefined ? c.createdAt + c.plan.rugAt * 1000 : c.ruggedAt;
      if (rugMs !== undefined && rugMs > this.lastScan && rugMs <= m.time && (c.mine || rng.chance(0.35))) {
        const acc = getAccount("rugwatch")!;
        const who = c.mine ? "the dev (one of you 👀)" : "dev + bundle wallets";
        this.push({ author: acc.id, kind: "rug", text: `🚨 RUG: $${c.ticker}, ${who} just dumped everything. Stay safe out there`, links: { [c.ticker]: c.id } }, acc.followers, m.time);
      }
      // whale buys since the last tick (newest trades are at the end)
      if (m.time - this.lastWhaleAt < WHALE_COOLDOWN_MS || c.dead) continue;
      for (let i = c.trades.length - 1; i >= 0 && c.trades[i].t > this.lastScan; i--) {
        const t = c.trades[i];
        if (t.side === "buy" && t.sol >= WHALE_SOL && t.kind !== "you" && (!whale || t.sol > whale.sol)) {
          whale = { c, sol: t.sol, kol: t.kind === "kol" };
        }
      }
    }
    if (whale) {
      this.lastWhaleAt = m.time;
      const v = coinVars(whale.c);
      this.push({
        author: alerts.id, kind: "whale",
        text: `🐋 Whale alert: ${whale.sol.toFixed(1)} SOL buy on $${whale.c.ticker} at ${v.mc} SOL MC${whale.kol ? " (known KOL wallet)" : ""}`,
        links: { [whale.c.ticker]: whale.c.id },
      }, alerts.followers, m.time);
    }
  }

  // ---------- you ----------

  /** Post as yourself. Mention $TICKERs to send your followers in; attach a closed trade to flex. */
  post(m: Market, text: string, pnlCoinId?: string): { ok: true; tweet: Tweet } | { ok: false; reason: string } {
    const rng = this.rng;
    text = text.trim();
    const pos = pnlCoinId ? m.positions.get(pnlCoinId) : undefined;
    if (!text && !pos) return { ok: false, reason: "Write something first" };
    if (text.length > MAX_TEXT) return { ok: false, reason: `Max ${MAX_TEXT} characters` };
    const wait = POST_COOLDOWN_MS - (m.time - this.lastPostAt);
    if (wait > 0) return { ok: false, reason: `Slow down, wait ${Math.ceil(wait / 1000)}s` };
    if (pnlCoinId && (!pos || pos.boughtSol <= 0)) return { ok: false, reason: "No trade to share" };

    const F = this.followers;
    let likes = F * rng.range(0.01, 0.04) + rng.int(0, 3);
    let gained = likes * rng.range(0.03, 0.12);

    let pnl: Tweet["pnl"];
    if (pos) {
      const value = pos.tokens > 0 ? m.positionValue(pos.coinId) - pos.costSol : 0;
      const pnlSol = pos.realizedSol + value;
      const pnlPct = (pnlSol / pos.boughtSol) * 100;
      pnl = { ticker: pos.ticker, pnlSol, pnlPct };
      // Big green PnL goes viral. Brutal losses sometimes do too (loss porn).
      let viral = Math.max(0, pnlPct) * 0.3 + Math.max(0, pnlSol) * 15;
      if (pnlPct < -60 && rng.chance(0.3)) viral += 15;
      const boost = viral * rng.range(0.6, 1.6) * (1 + Math.sqrt(F) / 100);
      gained += boost;
      likes += boost * rng.range(2, 5);
    }

    // Followers ape the coins you mention. Spamming the same coin wears off.
    const links: Record<string, string> = {};
    let apes = 0;
    const tickers = [...new Set([...text.matchAll(/\$([A-Za-z0-9]{1,10})/g)].map((x) => x[1].toUpperCase()))].slice(0, 3);
    for (const t of tickers) {
      const c = findCoin(m, t);
      if (!c) continue;
      links[t] = c.id;
      const repeats = this.shills.filter((s) => s.coinId === c.id).length;
      const fatigue = 0.4 ** repeats;
      const buyers = Math.round(Math.sqrt(F) * 0.35 * rng.range(0.5, 1.5) * fatigue);
      const strength = Math.min(1.2, Math.log10(1 + F) * 0.15) * fatigue;
      m.hype(c.id, { strength, buyers, avgBuySol: 0.3, by: "you" });
      apes += buyers;
      this.shills.push({ coinId: c.id, ticker: c.ticker, mcapUsd: mcapUsd(c.r), evalAt: m.time + SHILL_EVAL_MS });
    }

    gained = Math.round(gained);
    this.followers += gained;
    this.lastPostAt = m.time;
    const tweet = this.push({ author: "you", kind: "you", text, links, pnl, gained, apes }, F, m.time, likes);
    return { ok: true, tweet };
  }

  /** 3 minutes after a call: did it pump (reputation up) or dump on your followers? */
  private judgeShills(m: Market) {
    const due = this.shills.filter((s) => s.evalAt <= m.time);
    if (!due.length) return;
    this.shills = this.shills.filter((s) => s.evalAt > m.time);
    for (const s of due) {
      const c = m.coins.get(s.coinId);
      const ratio = c ? mcapUsd(c.r) / s.mcapUsd : 0;
      if (ratio >= 1.5) {
        const won = Math.round(10 + this.followers * 0.03);
        this.followers += won;
        this.lastCall = "good";
        this.alert(`Your call on $${s.ticker} did ${Math.round((ratio - 1) * 100)}%. +${won} followers 📈`, "good", s.coinId);
      } else if (ratio <= 0.5) {
        const lost = Math.min(this.followers, Math.round(this.followers * 0.05));
        this.followers -= lost;
        this.lastCall = "bad";
        this.alert(`$${s.ticker} dumped ${Math.round((1 - ratio) * 100)}% after your call. -${lost} followers 📉`, "bad", s.coinId);
      }
    }
  }

  // ---------- helpers ----------

  private push(
    t: Omit<Tweet, "id" | "t" | "likes" | "reposts" | "views" | "replies">,
    followers: number,
    now: number,
    likes?: number,
  ): Tweet {
    const rng = this.rng;
    const l = Math.round(likes ?? followers * rng.range(0.0002, 0.003) * rng.range(0.5, 2));
    const tweet: Tweet = {
      ...t, id: this.nextId++, t: now, replies: this.replies(t, followers),
      likes: l, reposts: Math.round(l * rng.range(0.08, 0.25)), views: Math.round(l * rng.range(15, 45) + rng.int(5, 50)),
    };
    this.feed.unshift(tweet);
    if (this.feed.length > MAX_FEED) {
      // keep your own posts around longer than bot noise
      const mine = this.feed.filter((x) => x.author === "you").slice(0, 50);
      this.feed = [...new Set([...this.feed.slice(0, MAX_FEED - 10), ...mine])].sort((a, b) => b.t - a.t);
    }
    return tweet;
  }

  /** Reply guys: more for bigger accounts, and they react to what the post was. */
  private replies(t: Pick<Tweet, "kind" | "pnl" | "links">, followers: number): Reply[] {
    const rng = this.rng;
    const n = Math.min(5, Math.round(Math.log10(followers + 1) * rng.range(0.1, 0.7)));
    let pool: string[];
    switch (t.kind) {
      case "you":
        pool = t.pnl ? (t.pnl.pnlSol >= 0 ? REPLIES.winFlex : REPLIES.lossFlex)
          : Object.keys(t.links).length ? REPLIES.yourShill : REPLIES.chatter;
        break;
      case "grad":
      case "gainer":
        pool = REPLIES.gainer;
        break;
      case "meta":
        pool = REPLIES.shill;
        break;
      case "shill": case "keyword": case "warning": case "clean": case "whale": case "rug":
        pool = REPLIES[t.kind];
        break;
      default:
        pool = REPLIES.chatter;
    }
    // different reply guys, each saying something different
    const handles = [...REPLY_HANDLES].sort(() => rng.next() - 0.5);
    const lines = [...pool].sort(() => rng.next() - 0.5);
    const out: Reply[] = [];
    for (let i = 0; i < Math.min(n, lines.length); i++) out.push({ handle: handles[i], text: lines[i] });
    return out;
  }

  private remember(coinId: string) {
    this.called.add(coinId);
    if (this.called.size > 500) this.called = new Set([...this.called].slice(-250));
  }

  private alert(text: string, tone: SocialAlert["tone"], coinId?: string) {
    this.alerts.push({ id: this.nextId++, text, tone, coinId });
    if (this.alerts.length > 50) this.alerts.splice(0, this.alerts.length - 50);
  }

  // ---------- persistence ----------

  save(now: number): SocialSave {
    return {
      followers: this.followers,
      posts: this.feed.filter((x) => x.author === "you").slice(0, 30).map((x) => ({ ...x, ageMs: now - x.t })),
    };
  }

  load(s: SocialSave, now: number) {
    this.followers = s.followers;
    for (const p of s.posts) {
      const { ageMs, ...tweet } = p;
      this.feed.push({ ...tweet, id: this.nextId++, t: now - ageMs });
    }
    this.feed.sort((a, b) => b.t - a.t);
  }

  /** Forget run-specific state (pending calls) but keep your account. */
  newRun() {
    this.shills = [];
    this.lastPostAt = -Infinity;
  }
}

/** The coin a $TICKER most likely means: yours, then one you hold, then the biggest live one. */
export function findCoin(m: Market, ticker: string): Coin | undefined {
  const matches = [...m.coins.values()].filter((c) => c.ticker.toUpperCase() === ticker.toUpperCase() && !c.dead);
  if (!matches.length) return undefined;
  const score = (c: Coin) =>
    (c.mine ? 2e12 : 0) + ((m.positions.get(c.id)?.tokens ?? 0) > 0 ? 1e12 : 0) + mcapUsd(c.r);
  return matches.sort((a, b) => score(b) - score(a))[0];
}
