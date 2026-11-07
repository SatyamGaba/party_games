/** Pure game rules shared by the server, the client and the tests. No I/O. */
import { manifest } from "./manifest";

export type Role = "civilian" | "undercover" | "white";
export type ClueMode = "spoken" | "typed";
export type ModeratorView = "reveal" | "hide";
export interface WordPair {
  a: string;
  b: string;
  category: string;
}

export const LIMITS = {
  word: 40,
  category: 30,
  clue: 30,
  guess: 40,
} as const;
/** Built-in categories. Names only, so the client can list them; the words stay server-side. */
export const CATEGORIES = [
  "Food & drink",
  "Animals",
  "Places",
  "Objects",
  "Jobs",
  "Sports & hobbies",
  "Entertainment",
  "Nature",
  "Diwali 2026",
] as const;
export type Category = (typeof CATEGORIES)[number];
export const TURN_SECONDS = [15, 30, 45, 60, 0] as const;
export const DISCUSSION_SECONDS = [60, 90, 120, 180, 0] as const;
export const POINTS: Record<Role, number> = {
  civilian: 2,
  white: 6,
  undercover: 10,
};

/** Case, accents, spacing, punctuation and a trailing plural "s"/"es" don't matter. */
export function normalize(text: string) {
  const plain = text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
  return plain
    .split(" ")
    .map((w) =>
      w.length > 3 && w.endsWith("es") && /(s|x|z|ch|sh)es$/.test(w)
        ? w.slice(0, -2)
        : w.length > 2 && w.endsWith("s") && !w.endsWith("ss")
          ? w.slice(0, -1)
          : w,
    )
    .join("");
}

export const sameWord = (a: string, b: string) =>
  normalize(a) !== "" && normalize(a) === normalize(b);

/** A typed clue leaks the word when the word appears in it, ignoring the noise above. */
export function leaksWord(clue: string, word: string) {
  const w = normalize(word);
  return w !== "" && normalize(clue).includes(w);
}

export interface Split {
  undercover: number;
  white: number;
}

/** Infiltrators must stay a strict minority, and there's always at least one. */
export function validSplit(players: number, split: Split) {
  const infiltrators = split.undercover + split.white;
  return (
    players >= manifest.minPlayers &&
    split.undercover >= 0 &&
    split.white >= 0 &&
    split.white <= 1 &&
    infiltrators >= 1 &&
    players - infiltrators > infiltrators
  );
}

export function suggestedSplit(players: number): Split {
  if (players <= 5) return { undercover: 1, white: 0 };
  if (players <= 8) return { undercover: 1, white: 1 };
  if (players <= 12) return { undercover: 2, white: 1 };
  return { undercover: 3, white: 1 };
}

/** Every valid split for this many players, used for "randomize". */
export function allSplits(players: number): Split[] {
  const out: Split[] = [];
  for (let white = 0; white <= 1; white++)
    for (let undercover = 0; undercover < players; undercover++)
      if (validSplit(players, { undercover, white }))
        out.push({ undercover, white });
  return out;
}

export function deal(
  ids: string[],
  split: Split,
  random: (n: number) => number,
): Record<string, Role> {
  const shuffled = shuffle(ids, random);
  const roles: Record<string, Role> = {};
  shuffled.forEach((id, i) => {
    roles[id] =
      i < split.undercover
        ? "undercover"
        : i < split.undercover + split.white
          ? "white"
          : "civilian";
  });
  return roles;
}

export function shuffle<T>(items: T[], random: (n: number) => number) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Who has won, if anyone, given the roles still in the game. */
export function winner(alive: Role[]): "civilians" | "infiltrators" | null {
  const civilians = alive.filter((r) => r === "civilian").length;
  const infiltrators = alive.length - civilians;
  if (infiltrators === 0) return "civilians";
  if (civilians <= 1) return "infiltrators";
  return null;
}

/** Ids with the most votes. Abstentions are simply missing from `votes`. */
export function topVoted(votes: Record<string, string>) {
  const tally: Record<string, number> = {};
  for (const target of Object.values(votes))
    tally[target] = (tally[target] ?? 0) + 1;
  const max = Math.max(0, ...Object.values(tally));
  return {
    tally,
    top: max ? Object.keys(tally).filter((id) => tally[id] === max) : [],
  };
}

export const pairKey = (p: { a: string; b: string }) =>
  [normalize(p.a), normalize(p.b)].sort().join("|");
