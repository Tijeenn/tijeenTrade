# Moon City: handoff for the Roblox build

This file is everything a new Claude session needs to start building the game in Roblox Studio.
Read it fully before touching Studio. The owner (Tijeenn) already agreed to everything below;
don't re-ask these decisions, just build. Ask only when something here is genuinely unclear.

- Design sketches (5 boards): images in `roblox/sketches/` (open them with the Read tool), also at
  https://claude.ai/artifact/8nrEswxkWaiBQFq92QD8ju
  - `1-basement-spawn.png`: spawn in Mom's basement, [E] Sit at PC, Moonies HUD, first quest
  - `2-trading-terminal.png`: MoonTerminal trading app on the PC
  - `2b-pc-desktop-apps.png`: the PC desktop with all apps, Chirp + Moon Wallet open, taskbar
  - `3-city-map.png`: Moon City layout and legend
  - `4-upgrades-ranks.png`: PCs, homes and ranks
  The sketches are a guide for the look, not exact. Where they differ from this file, this file wins
  (e.g. the sketches still show the parody "Elon Tusk"; in Roblox use made-up characters, see 2).
- The website this game grows out of: https://tijeentrade.vercel.app (this repo, `src/`)
- Working style: follow the karpathy guidelines the owner uses. Think before coding, keep it
  simple, make small changes that do one thing, and check each step works (playtest) before moving on.

## 0. Before you start

1. Run `/mcp` (or `claude mcp list`): `Roblox_Studio` must be connected. Studio must be open with
   the place loaded and show **MCP on** in the bottom-right corner.
2. Look at what is in the place first (the owner starts from an empty Baseplate called Place1).
3. Build in Studio through the MCP tools. Also save every script you write to `roblox/src/` in this
   repo (same tree as in Studio, see section 6) and commit, so the code isn't only inside the place file.
4. Remind the owner to save the place (File > Save to Roblox) after each milestone.

## 1. The pitch

You spawn **broke** in your mom's basement. The only way to trade memecoins is to **sit down at a
PC** (walk up, press **E**). The PC opens a desktop with our own apps: a trading terminal, our own
X, our own wallet and more. Earn your first **Moonies** with jobs in the city, trade them, and spend
the profit on a better PC, a better home and a higher rank. Build a legacy, or go broke and flip
burgers again.

The loop: **job → trade at your PC → upgrade → trade bigger → (or rug/get rugged → back to work)**.

## 2. Hard rules

- **Original game.** Our own names, art and UI. Don't copy another Roblox game.
- **Currency is Moonies** (icon: yellow crescent moon). It's fictional, can't be cashed out and is
  not crypto. Never mention real coins, real money or real exchanges in-game.
- **No real people.** The website uses parody celebrities ("Elon Tusk", "Donald Rump"). Do NOT use
  those in Roblox: Roblox rules are strict on real people and politics. Use made-up characters
  instead (see section 4.3).
- **Robux and Moonies:** don't sell Moonies for Robux. Trading with a currency you can buy is
  close to gambling under Roblox's rules. Robux can buy cosmetics, outfits, house decorations and
  game passes (e.g. a 2nd bot slot, VIP desk skin). Moonies come only from playing.
  Ask the owner before adding any paid item that affects trading.
- **The server is the boss.** Balances, prices and trades are calculated on the server only. The
  client sends requests through RemoteEvents/RemoteFunctions, and the server checks everything
  (does the player own it, are they sitting at a PC, have they got enough Moonies, rate limits).
- Save player data with DataStoreService (Moonies, owned items, rank, stats). Use pcall + retry,
  and save on leave and every 60s.

## 3. World (see board "3 · The city map")

Moon City, one map. Bright, chunky, cartoon style. Font: Fredoka (or the closest Roblox font, e.g. FredokaOne).

| Place | Color | What it does |
|---|---|---|
| Mom's House | blue `#4c6fd6` | Spawn. Basement with 1 desk + old PC. Mom can call you upstairs (quests). |
| Moon Burger | orange `#e08a3a` | Job: flip burgers (simple timing minigame). |
| Pizza Rocket | orange | Job: deliver pizzas around the map (scooter, timed). |
| Internet Café | purple `#7b6cff` | Rent a PC per minute. You can trade here before owning a good PC. |
| Launch Pad | yellow `#e8c13a` | Launch your own coin on a stage; the whole server gets an announcement. |
| Trading Tower | purple | Offices (bought homes). The penthouse is on top. Big screens with live charts. |
| Real Estate | green `#2fb37a` | Buy homes. |
| Tech & Style | green | Buy PCs, phone, cars, outfits. |
| Rug Detective HQ | red `#c64b5c` | Consequences for rugging (see 4.6). |

UI colors (from the sketches): background `#141725`, panels `#1c2032`, borders `#2a2f42`, text white,
muted `#c7cbd9`, gold/Moonies `#ffd54a`, green for profit, red for loss. Rounded corners everywhere (UICorner 16–24).

## 4. Systems

### 4.1 The PC (core mechanic)
- A ProximityPrompt "Sit at PC" (key E) on every PC the player owns or rents. Sitting locks the
  character in the chair and opens the **desktop GUI** (board "2b"). Press **Q** to stand up.
- The server tracks who is seated at which PC. Trading remotes are refused if you're not seated,
  unless you own the Phone (basic buy/sell anywhere).
- Your PC tier changes what you get (see 4.5).

### 4.2 Desktop apps (board "2b · The PC desktop")
1. **MoonTerminal**: trading. Port of the website: Pulse list of new coins (New / About to graduate /
   Graduated), coin page with candle chart, buy/sell panel with preset amounts, holders, trades,
   dev info, your position and PnL. Buy/sell markers on the chart, PnL toast after every sell.
2. **Chirp**: our own X. A feed of posts from NPC characters, the Rug Detective and real players.
   Players can post; mentioning `$TICKER` from a player with followers pumps that coin a bit
   (website logic: `src/lib/sim/social.ts`, `hype`). Followers grow when your calls go up.
3. **Moon Wallet**: Moonies balance, coin holdings, **send Moonies to friends**, receive, history.
4. **LaunchPad**: create your own coin (name, ticker, image color/emoji, dev buy, socials on/off).
   Everyone in the server can see and trade it. You can rug it (sell your whole bag).
5. **Bots**: sniper bot (unlocked by Gaming Rig). Settings like the website's `/bots` page:
   buy size, max dev %, max bundle %, take profit, stop loss, max hold time.
6. **Job Board**: lists jobs and what they pay; tap to set a waypoint.
7. **Mail**: quests and tutorial messages (from Mom, the bank, the Rug Detective).
8. **MoonShop**: browse and buy upgrades from the PC (same items as the store in the city).

Plus a taskbar with Moonies, location and in-game clock, and notification toasts (sells, rugs, mentions).

### 4.3 Market (port from the website)
The website already has a tested, realistic memecoin simulator. **Port it to Luau, don't reinvent it.**
Source files: `src/lib/sim/curve.ts`, `plan.ts`, `market.ts`, `names.ts`, `social.ts`, `bots.ts`, `rng.ts`.

- **One market per server**, run in a server Script (tick ~4×/sec). Every player in the server sees the
  same coins and the same charts. NPC coins spawn all the time; player coins come from LaunchPad.
- **Bonding curve** (x·y=k on virtual reserves), then a normal pool after graduation. Website
  constants are in SOL; in Roblox **1 SOL = 100 Moonies**:
  - total supply 1,000,000,000; 793,100,000 sellable on the curve
  - start virtual reserves: 3,000 Moonies / 1,073,000,000 tokens
  - curve fee 1%, pool fee 0.25%, platform fee 1% on every trade
  - graduation when all curve tokens are sold
- **Hidden fate per NPC coin** (`ARCHETYPE_ODDS`): dud 62%, rug 20%, pump & dump 13%, runner 4.2%,
  moon 0.8%. Order flow is steered toward a target market cap path (`targetMcap`) plus noise.
  Show market cap in Moonies (website shows USD; replace that with Moonies).
- Snipers, bundles, stealth rugs, dev profiles (serial ruggers), rotating "metas", order latency and
  slippage all exist on the website. Port them in that order of priority: curve → fates → snipers →
  rugs/bundles → socials/metas → the rest.
- Calibration targets (from the website's Monte Carlo runs): random aping loses ~10%; careful
  play makes +4–12%; a well-tuned sniper bot makes ~+12–15%. Success shouldn't be rare, but it shouldn't be easy either.
- **When a player leaves**, their open positions are sold at the current price (warn them in the UI:
  "Leaving sells your bags"). Coins don't move between servers.
- NPC Chirp characters: make up our own, e.g. *Lunar Larry* (mega influencer), *Captain Pump*,
  *Satoshi Snacks*, *Degen Dana*, the *Rug Detective*. Post types to port: chatter, shill, warning,
  whale alert, rug alert, gainer, graduation, meta, mention.

### 4.4 Jobs
Simple, short (30–90s) and repeatable. They're the fallback when you go broke.
- Moon Burger: flip at the right moment, ~30 Moonies per good burger set.
- Pizza Rocket: deliver to a marked house before the timer ends, 40–80 Moonies based on speed.
- Daily login reward and quests from Mail (tutorial pays out the first ~100 Moonies).

### 4.5 Upgrades (board "4 · Upgrades")
Starting prices; tune them by playtesting.

| PC | Price | Perk |
|---|---|---|
| Old PC | free | Slow orders (+1s latency), 1 chart |
| Gaming Rig | 2,500 | Normal speed, unlocks 1 sniper bot |
| Battlestation | 25,000 | 3 screens (chart + coin feed + Chirp), fastest orders, 2 bots |
| Phone | 8,000 | Basic buy/sell anywhere in the city |

| Home | Price | Perk |
|---|---|---|
| Mom's Basement | free | One desk, Mom interrupts |
| Apartment | 10,000 | Private room, 2nd desk, decorate |
| Office (Trading Tower) | 75,000 | NPC bot traders at desks, big wall screens |
| Penthouse | 500,000 | Top of the tower, the flex |

Ranks by net worth (Moonies + value of open bags), shown above the head and in the HUD:
**Broke** (<1k) → **Stargazer** (1k) → **Rocket** (10k) → **Moon Walker** (100k) → **Moon Lord** (1M).
Plus a server leaderboard (net worth) and a global one (OrderedDataStore, best % return, like the website).

### 4.6 Rugging
You can rug your own coin, and other players lose. Rugging costs you something:
- Every rug raises your "rug score". The Rug Detective posts about you on Chirp and your name gets a
  red tag in Pulse ("serial rugger") so other players can see it.
- At a high rug score: a fine (a % of your Moonies) and a short timeout in Rug Detective HQ jail.
- This keeps rugging fun but risky, and it gives the city drama.

## 5. Build order (milestones)

Do one at a time; playtest; commit; tell the owner what to try.

1. **Basement spawn + HUD.** Mom's house with basement, desk, chair, old PC; Moonies HUD (top);
   DataStore save/load; start with 0 Moonies + tutorial quest "Get a job".
2. **Sit at PC.** ProximityPrompt, seat lock, desktop GUI with app icons + taskbar, Q to stand.
3. **Market core.** Luau port of curve + fates; server tick; Pulse list in MoonTerminal.
4. **Trading.** Coin page, chart (frames-based candles), buy/sell remotes with checks, positions, PnL toasts.
5. **Moon Burger job** + city layout (roads, buildings as simple blocks at first).
6. **Moon Wallet** (send to friends) + **MoonShop/Tech & Style**: Gaming Rig and Phone.
7. **LaunchPad + rugging + Rug Detective.**
8. **Chirp** (NPC posts, player posts, hype).
9. **Homes + Real Estate**, ranks, leaderboards.
10. **Bots app**, Pizza Rocket, Internet Café, polish (sounds, particles on big wins), then Robux cosmetics.

## 6. Code layout

```
ReplicatedStorage/
  Shared/       Config (prices, ranks, constants), Curve (pure math), Types
  Remotes/      RemoteEvents + RemoteFunctions (one folder)
ServerScriptService/
  Main.server.lua        wires services, PlayerAdded/Removing
  Services/  Data, Economy, Market, Social, Jobs, Shop, Housing, Rugs, Bots
StarterPlayer/StarterPlayerScripts/
  Client.client.lua       input, PC sit/stand, HUD
StarterGui/
  HUD, Desktop (apps as Frames), Toasts
```

Mirror this tree under `roblox/src/` in the repo. Keep pure logic (curve math, fates) in ModuleScripts
that don't touch Roblox APIs, so they're easy to check against the TypeScript originals.
