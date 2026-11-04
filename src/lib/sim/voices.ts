/**
 * How each simulated account talks. Placeholders:
 *   {T} ticker (rendered as $T), {mc} market cap in SOL, {x} multiple since launch,
 *   {word} / {Word} a theme word, {holders} holder count, {you} your handle.
 */
export interface Voice {
  chatter: string[];
  shill?: string[]; // talking up a specific coin
  keyword?: string[]; // celebrity word posts that pump every matching coin
}

export const VOICES: Record<string, Voice> = {
  elontusk: {
    chatter: ["🐸", "lmao", "the algorithm is cooking today", "Doge was just the beginning", "Mars, but make it memes",
      "if you're reading this you should be working", "the most entertaining outcome is the most likely", "💯", "Interesting"],
    keyword: ["{Word} 🚀", "{word}", "I ❤️ {word}s", "the future is {word}s", "my {word} is cuter than yours", "{Word}Coin?", "who let the {word}s out"],
  },
  realDonaldRump: {
    chatter: ["MEMECOINS ARE MAKING A TREMENDOUS COMEBACK. NOBODY HAS EVER SEEN ANYTHING LIKE IT!",
      "The Fake News won't tell you about the GREATEST BULL MARKET IN HISTORY. Sad!",
      "Many people are saying I am the best crypto President. Maybe ever!", "SOL is doing very well. Thank you!",
      "The haters and losers sold too early. Too bad!"],
    keyword: ["I LOVE {WORD}S. The best {word}s. Everybody says so!", "{WORD} IS THE FUTURE. BELIEVE ME!",
      "Nobody knows more about {word}s than me. TREMENDOUS!", "Just met the most beautiful {word}. HUGE!"],
  },
  mrfeast: {
    chatter: ["I gave a random guy 100 SOL to trade memecoins for 24 hours, video drops Sunday",
      "Last to sell wins 1,000 SOL 👀", "Should I launch a coin? Reply below", "Subscribe or I'll rug you (jk)"],
    keyword: ["Buying a {word} for every subscriber 🎁", "I just adopted 100 {word}s", "{Word} challenge starts NOW"],
  },
  kanyewaste: {
    chatter: ["I AM THE GREATEST TRADER OF ALL TIME", "THEY TOLD ME I COULDN'T TRADE MEMECOINS",
      "WHO NEEDS A BANK WHEN YOU HAVE A BONDING CURVE", "MY NEXT ALBUM WILL BE ON CHAIN", "I SOLD THE TOP. I ALWAYS SELL THE TOP"],
    keyword: ["{WORD}", "{WORD}S ARE THE NEW GOLD", "I AM A {WORD}", "NOBODY UNDERSTANDS THE {WORD}"],
  },
  snoopdogecoin: {
    chatter: ["fo shizzle my memecoin nizzle", "pass the bag 💨", "just vibin with the degens tonight",
      "dogecoin taught me patience, memecoins taught me speed"],
    keyword: ["{word} vibes only 🌿", "big {word} energy, ya dig", "sippin on {word} juice", "{Word} Dogg in the building"],
  },
  vitalikbutter: {
    chatter: ["An interesting property of bonding curves is that the floor price is guaranteed, but nothing else is.",
      "Wrote a long post on why most memecoins are a negative-sum game after fees. Nobody will read it.",
      "Sniper bots are just MEV with extra steps.", "Reminder: a 1% fee on every trade compounds faster than you think."],
    shill: ["{T} has a surprisingly fair launch: low dev share, no bundles. Not an endorsement.", "Looked at {T}'s holder distribution. Better than most."],
  },
  saylormoon: {
    chatter: ["There is no second best.", "Laser eyes until 1M SOL MC.", "Volatility is a gift to the faithful.",
      "I don't sell. I buy more.", "Your fiat is melting."],
    shill: ["{T} is the apex predator of this cycle 🟠", "Bought more {T}. Then I bought more.", "{T} at {mc} SOL is cheap. Think in decades."],
  },
  cobiewan: {
    chatter: ["the trenches have aged me 10 years", "everyone's a genius in a bull market", "I'll be honest I don't know what's happening",
      "most of you will be fine. some of you will be very not fine"],
    shill: ["ok {T} is kinda funny", "{T} at {mc} SOL? this might be the one. or not. idk", "a little {T}, as a treat"],
  },
  ansemble: {
    chatter: ["send it", "you're early. you're always early. until you're late", "the market rewards conviction",
      "attention is the only currency", "cycle top is when your barber asks about memecoins"],
    shill: ["{T}", "{T} 👀", "this one. {T}", "{T} looks like it wants to send", "I like {T} here"],
  },
  gcrghost: {
    chatter: ["fading everything today", "the crowd is never right at extremes", "shorting your favorite memecoin",
      "imagine buying here. couldn't be me"],
    shill: ["Fading {T}. {x} from launch is too much too fast", "{T} is a top signal if I've ever seen one", "contrarian take: {T} is actually early"],
  },
  muradmemes: {
    chatter: ["the memecoin supercycle is inevitable", "cults > fundamentals", "find a community that will never sell",
      "every chart looks like this before it goes vertical"],
    shill: ["{T} community has cult energy. That's all that matters", "{T} holders are not selling. Supercycle.", "{T} at {mc} SOL, generational entry"],
  },
  solsensei: {
    chatter: ["lesson #1: the bundle % tells you everything", "if the dev bought 10%+ just walk away",
      "snipers dump in 30s. be patient", "the best trade is often no trade"],
    shill: ["{T} passes my checklist: clean dev, no bundles, real buyers", "{T} chart is textbook, watching"],
  },
  degenintern: {
    chatter: ["day 47 of trying to make it. still not made it", "boss caught me trading on the work laptop",
      "bought the top. sold the bottom. again", "what if I just... don't sell this time"],
    shill: ["aped {T} with my lunch money", "{T} or I'm moving back in with my parents", "{T} 100x incoming trust me bro"],
  },
  rugdetective: {
    chatter: ["90% of today's launches were bundled. check before you ape", "same dev wallet, 6 rugs this week. names change, wallets don't",
      "if the top 10 holders own 40%, you are their exit liquidity"],
  },
  wifhatguy: {
    chatter: ["hat stays on", "wif hat > without hat", "I only buy coins with hats now", "the hat knows"],
    shill: ["{T} needs a hat", "putting a hat on {T}. it's going up", "{T} wif hat when"],
  },
  jeethunter: {
    chatter: ["selling for 20% is a crime", "paper hands everywhere today", "I've seen jeets sell at 2x then buy back at 10x",
      "diamond hands or no hands"],
    shill: ["{T} holders aren't jeeting. bullish", "if you sold {T} early, I'm sorry for your loss"],
  },
  pumpalerts: { chatter: ["🟢 launches are heating up", "volume is up 40% in the last hour 📊"] },
  rugwatch: { chatter: ["Reminder: a dev selling is not always a rug. A dev selling everything is."] },
};

/** Generic reply guys under posts. */
export const REPLY_HANDLES = [
  "solmaxi99", "anon_trades", "degen_dave", "rugpullsurvivor", "wagmi_willy", "jeet_jenny", "bagholder_bob",
  "100x_or_bust", "exitliquidity", "sniper_sam", "gm_gary", "notfinancialadvice", "moonboy_mike", "paperhands_pete",
  "chartreader", "ape_ape_ape", "rekt_rick", "fomo_fiona", "cope_harder", "wenlambo",
];

export const REPLIES = {
  shill: ["LFG 🚀", "aped", "already up 2x thx", "ser this is a rug", "bought the top again didn't I", "wen binance",
    "chart looks cooked", "this is the one", "dev wallet?", "ngmi if you fade this", "too late?", "sold too early 😭"],
  keyword: ["HE SAID IT 🚀🚀🚀", "aping every coin with that name", "it's over, it's so back", "the man moves markets",
    "bought 3 of them lol", "this is financial advice now"],
  warning: ["saved me, thank you", "too late, already rugged", "the real heroes", "bro I just bought 💀", "fud", "how do you find these"],
  clean: ["finally a clean one", "aped based on this", "trusting the detective"],
  whale: ["who is this guy", "follow the whale 🐋", "he's going to dump on us", "copytrading this wallet"],
  rug: ["rip", "got me", "dev is a menace", "called it", "another one", "I need a break"],
  gainer: ["missed it again", "how do people find these", "top signal?", "still early"],
  chatter: ["real", "gm", "this", "lmao", "facts", "ser", "😂", "based", "cope"],
  winFlex: ["teach me sensei 🙏", "how do you keep winning", "what are you buying next?", "fake screenshot 😂", "legend", "I faded this 💀"],
  lossFlex: ["F", "we've all been there", "buy high sell low gang", "at least you're honest", "pain"],
  yourShill: ["aped because of you", "ser I trust you", "if this rugs I'm unfollowing", "LFG", "how much are you holding?"],
};
