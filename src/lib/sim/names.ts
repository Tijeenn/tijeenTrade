import type { Rng } from "./rng";

const ADJ = [
  "Based", "Sad", "Angry", "Tiny", "Giga", "Baby", "Dark", "Turbo", "Sleepy", "Rich", "Broke",
  "Moon", "Degen", "Chill", "Crying", "Wet", "Fat", "Smol", "Golden", "Magic",
  "Cyber", "Super", "Lil", "Big", "Frozen", "Spicy", "Drunk", "Lucky", "Ugly", "Cute", "Mad",
];
const NOUN = [
  "Frog", "Cat", "Dog", "Penguin", "Hamster", "Pepe", "Doge", "Shiba", "Goat", "Monkey", "Ape",
  "Whale", "Banana", "Potato", "Wizard", "Chad", "Bonk", "Duck", "Otter", "Capybara", "Pig",
  "Rat", "Bear", "Bull", "Hippo", "Fish", "Alien", "Robot", "Ghost", "Cheems", "Beaver", "Moo Deng",
];
const SOLO = [
  "GOAT", "WIF", "MEOW", "PNUT", "CHILLGUY", "FWOG", "MOODENG", "GIGA", "MICHI",
  "SIGMA", "TRUMP", "AI16Z", "ZEREBRO", "BILLY", "HOSICO", "SPX", "POPCAT", "NUB", "LOCKIN",
  "USA", "JAILSTOOL", "UNC", "SKIBIDI", "GRIFT", "MOG", "BRAINROT", "RIZZ", "AURA", "FARTCOIN",
];
const SUFFIX = ["", "", "", " Coin", " on Sol", " Inu", " AI", "2.0", " CTO"];

export function coinName(rng: Rng): { name: string; ticker: string } {
  if (rng.chance(0.3)) {
    const t = rng.pick(SOLO);
    const name = rng.chance(0.5) ? t.charAt(0) + t.slice(1).toLowerCase() : t;
    return { name: name + rng.pick(SUFFIX), ticker: t };
  }
  const a = rng.pick(ADJ);
  const n = rng.pick(NOUN);
  const ticker = rng.chance(0.5)
    ? n.replace(/\s/g, "").toUpperCase()
    : (a[0] + n.replace(/\s/g, "")).toUpperCase().slice(0, 8);
  return { name: `${a} ${n}${rng.pick(SUFFIX)}`, ticker };
}

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

export function address(rng: Rng, len = 44): string {
  let s = "";
  for (let i = 0; i < len; i++) s += B58[Math.floor(rng.next() * B58.length)];
  return s;
}
