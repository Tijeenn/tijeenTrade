import { describe, expect, it } from "vitest";
import { mcapUsd } from "./curve";
import { Market } from "./market";
import { POST_COOLDOWN_MS, Social, findCoin } from "./social";

function setup(seed = 3) {
  const m = new Market({ seed, startSol: 50 });
  const s = new Social(seed);
  m.step(120_000);
  return { m, s };
}

const liveCoin = (m: Market) =>
  [...m.coins.values()].find((c) => !c.dead && c.r.phase === "curve" && m.time - c.lastTradeAt < 2000 && c.plan.rugAt === undefined)!;

describe("social hype", () => {
  it("a big post sends a wave of buyers that pumps the coin", () => {
    const { m } = setup();
    const c = liveCoin(m);
    const before = mcapUsd(c.r);
    const buysBefore = c.buys;
    m.hype(c.id, { strength: 1.5, buyers: 50, avgBuySol: 0.5, by: "elontusk" });
    expect(c.hypedBy).toBe("elontusk");
    m.step(20_000);
    expect(c.buys - buysBefore).toBeGreaterThanOrEqual(50);
    expect(c.athMcap).toBeGreaterThan(before * 1.5);
  });

  it("bots keep posting, with clickable tickers for coins that exist", () => {
    const { m, s } = setup();
    for (let i = 0; i < 60; i++) {
      m.step(5000);
      s.step(m);
    }
    expect(s.feed.length).toBeGreaterThan(15);
    const linked = s.feed.flatMap((t) => Object.values(t.links));
    expect(linked.length).toBeGreaterThan(0);
    for (const id of linked) expect(id.endsWith("pump")).toBe(true);
  });
});

describe("posting as yourself", () => {
  it("mentioning a $TICKER sends your followers into that coin", () => {
    const { m, s } = setup();
    const c = liveCoin(m);
    s.followers = 10_000;
    const scheduledBefore = c.scheduled.length;
    const res = s.post(m, `$${c.ticker.toLowerCase()} is going to send`);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(findCoin(m, c.ticker)).toBe(c);
    expect(res.tweet.links[c.ticker]).toBe(c.id);
    expect(res.tweet.apes!).toBeGreaterThan(10);
    expect(c.scheduled.length - scheduledBefore).toBeGreaterThanOrEqual(res.tweet.apes!); // fast bots also queue a sell
    expect(c.hypedBy).toBe("you");
  });

  it("has a cooldown and validates", () => {
    const { m, s } = setup();
    expect(s.post(m, "   ").ok).toBe(false);
    expect(s.post(m, "x".repeat(281)).ok).toBe(false);
    expect(s.post(m, "gm").ok).toBe(true);
    const again = s.post(m, "gm again");
    expect(again.ok).toBe(false);
    m.step(POST_COOLDOWN_MS);
    expect(s.post(m, "gm again").ok).toBe(true);
  });

  it("flexing a winning trade earns more followers than a plain post", () => {
    const { m, s } = setup(8);
    const c = liveCoin(m);
    // fake a closed +300% trade
    m.positions.set(c.id, { coinId: c.id, ticker: c.ticker, tokens: 0, costSol: 0, realizedSol: 3, boughtSol: 1, soldSol: 4 });
    const plain = s.post(m, "gm");
    m.step(POST_COOLDOWN_MS);
    const flex = s.post(m, "ez", c.id);
    expect(plain.ok && flex.ok).toBe(true);
    if (!plain.ok || !flex.ok) return;
    expect(flex.tweet.pnl).toMatchObject({ ticker: c.ticker, pnlSol: 3, pnlPct: 300 });
    expect(flex.tweet.gained!).toBeGreaterThan(plain.tweet.gained! + 50);
  });

  it("keeps your followers and posts across a save", () => {
    const { m, s } = setup();
    s.followers = 1234;
    s.post(m, "remember me");
    const saved = JSON.parse(JSON.stringify(s.save(m.time)));
    const s2 = new Social(1);
    s2.load(saved, m.time + 5000);
    expect(s.followers).toBeGreaterThanOrEqual(1234); // the post itself may have gained some
    expect(s2.followers).toBe(s.followers);
    expect(s2.feed[0].text).toBe("remember me");
    expect(s2.feed[0].t).toBe(m.time + 5000); // posted "just now" at save time, same age after load
  });
});
