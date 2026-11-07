import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";
import { Client, type Room } from "@colyseus/sdk";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { UndercoverRoom } from "../src/games/undercover/server";
import type { UndercoverRoomState } from "../src/games/undercover/schema";
import { createPartyServer } from "../src/platform/server/create-server";
import { closeDatabase } from "../src/storage/database";
import type { Reply } from "../src/platform/contracts";
import {
  allSplits,
  deal,
  leaksWord,
  sameWord,
  suggestedSplit,
  topVoted,
  validSplit,
  winner,
  CATEGORIES,
} from "../src/games/undercover/rules";
import { BUILT_IN_PAIRS } from "../src/games/undercover/words";

describe("undercover rules", () => {
  it("matches guesses loosely but not wrongly", () => {
    expect(sameWord("Tea", " teas! ")).toBe(true);
    expect(sameWord("Café", "cafe")).toBe(true);
    expect(sameWord("Ice cream", "icecream")).toBe(true);
    expect(sameWord("Box", "boxes")).toBe(true);
    expect(sameWord("Glass", "glass")).toBe(true);
    expect(sameWord("Tea", "Coffee")).toBe(false);
    expect(sameWord("", "")).toBe(false);
  });
  it("catches clues that contain the word", () => {
    expect(leaksWord("hot COFFEE drink", "Coffee")).toBe(true);
    expect(leaksWord("morning drink", "Coffee")).toBe(false);
  });
  it("keeps Civilians a strict majority", () => {
    expect(validSplit(3, { undercover: 1, white: 0 })).toBe(true);
    expect(validSplit(3, { undercover: 1, white: 1 })).toBe(false);
    expect(validSplit(4, { undercover: 0, white: 0 })).toBe(false);
    expect(validSplit(6, { undercover: 2, white: 1 })).toBe(false);
    for (let n = 3; n <= 20; n++) {
      expect(validSplit(n, suggestedSplit(n))).toBe(true);
      expect(allSplits(n).every((s) => validSplit(n, s))).toBe(true);
    }
    const roles = Object.values(deal(["a", "b", "c", "d", "e", "f"], { undercover: 1, white: 1 }, () => 0));
    expect(roles.filter((r) => r === "civilian")).toHaveLength(4);
  });
  it("decides winners and ties", () => {
    expect(winner(["civilian", "civilian"])).toBe("civilians");
    expect(winner(["civilian", "undercover"])).toBe("infiltrators");
    expect(winner(["civilian", "civilian", "white"])).toBeNull();
    expect(topVoted({ a: "x", b: "y" }).top).toEqual(["x", "y"]);
    expect(topVoted({ a: "x", b: "x", c: "y" }).top).toEqual(["x"]);
    expect(topVoted({}).top).toEqual([]);
  });
  it("ships around 200 well-formed built-in pairs", () => {
    expect(BUILT_IN_PAIRS.length).toBeGreaterThanOrEqual(190);
    for (const p of BUILT_IN_PAIRS) {
      expect(p.a && p.b).toBeTruthy();
      expect(sameWord(p.a, p.b)).toBe(false);
    }
    expect(new Set(BUILT_IN_PAIRS.map((p) => p.category))).toEqual(new Set(CATEGORIES));
  });
});

/** Deterministic: random(n) is always 0, so the first rostered player is Undercover. */
class TestRoom extends UndercoverRoom {
  protected random() {
    return 0;
  }
  protected secondMs = 5;
  protected cardsMs = 2000;
  protected verdictMs = 60;
  protected guessMs = 2000;
  protected awayTurnMs = 100;
  protected reconnectSeconds = 0.3;
}
const application = createPartyServer({ undercover: TestRoom });
const data = mkdtempSync(join(tmpdir(), "undercover-tests-"));
let endpoint: string;
type R = Room<unknown, UndercoverRoomState>;
let rooms: R[] = [];
async function waitFor(predicate: () => boolean, timeout = 4000) {
  const until = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > until) throw new Error("Timed out waiting for state.");
    await new Promise((r) => setTimeout(r, 10));
  }
}
const me = (r: R) => r.state.seats.get(r.sessionId) ?? "";
async function join_(code: string | undefined, name: string, role = "player") {
  const sdk = new Client(endpoint);
  const room = code
    ? await sdk.joinById<UndercoverRoomState>(code, { name, role })
    : await sdk.create<UndercoverRoomState>("undercover", { name });
  rooms.push(room);
  await waitFor(() => Boolean(room.state?.game));
  return room;
}
const req = (r: R, type: string, payload: unknown = {}) =>
  r.request<unknown, Reply>(type, payload);
async function ok(r: R, type: string, payload: unknown = {}) {
  const reply = await req(r, type, payload);
  expect(reply, type + ": " + reply.error).toEqual({ ok: true });
}
/** Host plus `n` players. Returns players in roster (join) order. */
async function table(n: number) {
  const host = await join_(undefined, "Host");
  const players: R[] = [];
  for (let i = 0; i < n; i++) players.push(await join_(host.roomId, "P" + i));
  return { host, players };
}
const byId = (players: R[], id: string) => players.find((p) => me(p) === id)!;
/** Reads roles through the Reveal-roles host's view. */
async function withRole(host: R, players: R[], role: string) {
  await waitFor(() => players.every((p) => host.state.game.roles.get(me(p))?.role));
  return players.filter((p) => host.state.game.roles.get(me(p))?.role === role);
}
async function speakAll(players: R[], host: R) {
  await waitFor(() => host.state.game.phase === "describe");
  while (host.state.game.phase === "describe") {
    const turn = host.state.game.turn;
    const speaker = byId(players, host.state.game.order[turn]);
    await ok(speaker, "done");
    await waitFor(() => host.state.game.turn !== turn || host.state.game.phase !== "describe");
  }
}

beforeAll(async () => {
  process.env.DATA_DIR = data;
  await application.server.listen(0, "127.0.0.1");
  endpoint = "http://127.0.0.1:" + (application.http.address() as AddressInfo).port;
});
afterEach(async () => {
  await Promise.all(rooms.map((r) => r.leave().catch(() => undefined)));
  rooms = [];
});
afterAll(async () => {
  await application.server.gracefullyShutdown(false);
  closeDatabase();
  rmSync(data, { recursive: true, force: true });
});

describe("undercover with real clients", () => {
  it("needs 3 players besides the host, and only the host changes settings", async () => {
    const { host, players } = await table(2);
    expect((await req(host, "start")).error).toMatch(/at least 3/);
    expect((await req(players[0], "settings", { clueMode: "typed" })).ok).toBe(false);
    await ok(host, "settings", { clueMode: "typed", turnSeconds: 15 });
    await waitFor(() => players[0].state.game.settings.clueMode === "typed");
    expect((await req(host, "settings", { turnSeconds: 7 })).ok).toBe(false);
  });

  it("keeps words private, lets a Reveal-roles host see everything, and hides it all from the TV", async () => {
    const { host, players } = await table(4);
    const tv = await join_(host.roomId, "", "display");
    expect((await req(tv, "start")).ok).toBe(false);
    await ok(host, "start");
    await waitFor(() => players[0].state.game.phase === "cards");
    const [a, b] = players;
    const roster = [...host.state.game.roster];
    expect(roster).not.toContain(me(host));
    expect(a.state.game.cards.get(me(a))?.word).toBeTruthy();
    expect(a.state.game.cards.get(me(b))?.word).toBeUndefined();
    expect(a.state.game.roles.get(me(a))?.role).toBeUndefined();
    expect(tv.state.game.cards.get(me(a))?.word).toBeUndefined();
    expect(tv.state.game.roles.get(me(a))?.role).toBeUndefined();
    expect(await withRole(host, players, "undercover")).toHaveLength(1);
    expect(host.state.game.cards.get(me(b))?.word).toBeTruthy();
    expect(a.state.game.cards.get(me(a))?.word).not.toBe(b.state.game.cards.get(me(b))?.word);
  });

  it("plays a spoken game to a Civilian win, revealing roles and scoring", async () => {
    const { host, players } = await table(4);
    await ok(host, "start");
    for (const p of players) await ok(p, "ready");
    await speakAll(players, host);
    await waitFor(() => host.state.game.phase === "discuss");
    expect((await req(players[1], "openVote")).ok).toBe(false);
    await ok(host, "openVote");
    await waitFor(() => players[0].state.game.phase === "vote");
    const [uRoom] = await withRole(host, players, "undercover");
    const [c1, c2, c3] = await withRole(host, players, "civilian");
    const undercover = me(uRoom);
    expect((await req(c1, "vote", { target: me(c1) })).error).toMatch(/yourself/);
    await ok(c1, "vote", { target: me(c2) });
    await ok(c1, "vote", { target: undercover });
    await waitFor(() => c2.state.game.ballots.get(me(c1))?.cast === true);
    expect(c2.state.game.ballots.get(me(c1))?.target).toBeUndefined();
    await ok(c2, "vote", { target: undercover });
    await ok(c3, "vote", { target: undercover });
    await ok(uRoom, "vote", { target: me(c1) });
    await waitFor(() => host.state.game.phase === "ended");
    const g = c1.state.game;
    expect(g.winningSide).toBe("civilians");
    expect(g.revealed.get(undercover)).toBe("undercover");
    expect(g.lastVotes.get(me(c1))).toBe(undercover);
    expect(g.scores.get(me(c1))).toBe(2);
    expect(g.scores.get(undercover) ?? 0).toBe(0);
    expect(g.final.get(undercover)?.word).toBe(g.undercoverWord);
    expect(g.civilianWord).not.toBe(g.undercoverWord);
    // Another game in the same room keeps the scoreboard.
    await ok(host, "start");
    await waitFor(() => c1.state.game.game === 2);
    expect(c1.state.game.scores.get(me(c1))).toBe(2);
    expect(c1.state.game.revealed.size).toBe(0);
  });

  it("re-votes ties once, then ousts nobody", async () => {
    const { host, players } = await table(4);
    await ok(host, "settings", { discussionSeconds: 60 });
    await ok(host, "start");
    for (const p of players) await ok(p, "ready");
    await speakAll(players, host);
    await ok(host, "openVote");
    await waitFor(() => host.state.game.phase === "vote");
    const [a, b, c, d] = players;
    await ok(a, "vote", { target: me(b) });
    await ok(b, "vote", { target: me(a) });
    await ok(c, "vote", { target: me(a) });
    await ok(d, "vote", { target: me(b) });
    await waitFor(() => host.state.game.tieBreak);
    expect([...host.state.game.candidates].sort()).toEqual([me(a), me(b)].sort());
    expect((await req(c, "vote", { target: me(d) })).ok).toBe(false);
    await ok(a, "vote", { target: me(b) });
    await ok(b, "vote", { target: me(a) });
    await ok(c, "vote", { target: me(a) });
    await ok(d, "vote", { target: me(b) });
    await waitFor(() => host.state.game.outcome === "nobody");
    expect(host.state.game.out.length).toBe(0);
    await waitFor(() => host.state.game.phase === "describe");
    expect(host.state.game.round).toBe(2);
  });

  it("lets an ousted Mr. White win by guessing, and never lets Mr. White speak first", async () => {
    const { host, players } = await table(6);
    await ok(host, "start");
    await waitFor(() => host.state.game.phase === "cards");
    const [whiteRoom] = await withRole(host, players, "white");
    const white = me(whiteRoom);
    await waitFor(() => whiteRoom.state.game.cards.get(white)?.white === true);
    expect(whiteRoom.state.game.cards.get(white)?.white).toBe(true);
    expect(whiteRoom.state.game.cards.get(white)?.word).toBe("");
    for (const p of players) await ok(p, "ready");
    await waitFor(() => host.state.game.phase === "describe");
    expect(host.state.game.order[0]).not.toBe(white);
    await speakAll(players, host);
    await ok(host, "openVote");
    for (const p of players)
      await ok(p, "vote", { target: me(p) === white ? me(players.find((q) => me(q) !== white)!) : white });
    await waitFor(() => host.state.game.phase === "guess");
    expect((await req(players.find((q) => me(q) !== white)!, "guess", { text: "x" })).ok).toBe(false);
    const civilianWord = host.state.game.cards.get(me(players.find((q) => host.state.game.roles.get(me(q))?.role === "civilian")!))!.word;
    await ok(whiteRoom, "guess", { text: "  " + civilianWord.toUpperCase() + "! " });
    await waitFor(() => host.state.game.phase === "ended");
    expect(host.state.game.winningSide).toBe("white");
    expect([...host.state.game.winners]).toEqual([white]);
    expect(host.state.game.scores.get(white)).toBe(6);
  });

  it("rejects typed clues that leak the word, and logs them", async () => {
    const { host, players } = await table(3);
    await ok(host, "settings", { clueMode: "typed" });
    await ok(host, "start");
    for (const p of players) await ok(p, "ready");
    await waitFor(() => host.state.game.phase === "describe");
    const speaker = byId(players, host.state.game.order[0]);
    const word = speaker.state.game.cards.get(me(speaker))!.word;
    expect((await req(speaker, "done")).ok).toBe(false);
    expect((await req(speaker, "clue", { text: "my " + word })).error).toMatch(/own word/);
    await ok(speaker, "clue", { text: "zzz" });
    await waitFor(() => host.state.game.clues.length === 1);
    expect(host.state.game.clues[0].text).toBe("zzz");
  });

  it("skips expired turns", async () => {
    const { host, players } = await table(3);
    await ok(host, "settings", { clueMode: "typed", turnSeconds: 15 });
    await ok(host, "start");
    for (const p of players) await ok(p, "ready");
    await waitFor(() => host.state.game.phase === "discuss", 3000);
    expect(host.state.game.clues.map((c) => c.skipped)).toEqual([true, true, true]);
  });

  it("treats a departure as ousted without revealing the role, and can end the game", async () => {
    const { host, players } = await table(3);
    await ok(host, "start");
    await waitFor(() => host.state.game.phase === "cards");
    const [civilian] = await withRole(host, players, "civilian");
    const [uRoom] = await withRole(host, players, "undercover");
    const id = me(civilian);
    await civilian.leave();
    await waitFor(() => host.state.game.out.includes(id) || host.state.game.phase === "ended");
    // With 3 players, losing a Civilian leaves 1 Civilian vs 1 Undercover.
    expect(host.state.game.phase).toBe("ended");
    expect(host.state.game.winningSide).toBe("infiltrators");
    expect(host.state.game.revealed.has(id)).toBe(false);
    expect(host.state.game.scores.get(me(uRoom))).toBe(10);
  });

  it("only deals words from the chosen built-in categories", async () => {
    const { host, players } = await table(3);
    expect((await req(host, "settings", { categories: ["Not a category"] })).ok).toBe(false);
    await ok(host, "settings", { categories: ["Diwali 2026"] });
    await ok(host, "start");
    await waitFor(() => players.every((p) => p.state.game.cards.get(me(p))?.word));
    const diwali = new Set(
      BUILT_IN_PAIRS.filter((p) => p.category === "Diwali 2026").flatMap((p) => [p.a, p.b]),
    );
    for (const p of players) expect(diwali.has(p.state.game.cards.get(me(p))!.word)).toBe(true);
  });

  it("rejects an invalid custom split", async () => {
    const { host } = await table(3);
    await ok(host, "settings", { splitMode: "custom", undercover: 1, white: 1 });
    expect((await req(host, "start")).error).toMatch(/outnumber/);
  });
});
