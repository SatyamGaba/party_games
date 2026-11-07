import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";
import { Client, type Room } from "@colyseus/sdk";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { FastestRoom } from "../src/games/fastest-finger-first/server";
import type { FastestRoomState } from "../src/games/fastest-finger-first/schema";
import {
  loadPack,
  listPacks,
  packMediaRouter,
} from "../src/games/fastest-finger-first/packs";
import { createPartyServer } from "../src/platform/server/create-server";
import { closeDatabase } from "../src/storage/database";
import type { Reply } from "../src/platform/contracts";

class TestRoom extends FastestRoom {
  protected reconnectSeconds = 0.3;
  maxMessagesPerSecond = 1000; // Exercise many host actions without human interaction delays.
}
const application = createPartyServer({ "fastest-finger-first": TestRoom }, [
  packMediaRouter(),
]);
type Connection = Room<unknown, FastestRoomState>;
let data: string, endpoint: string;
let clients: Connection[] = [],
  guestNumber = 0;
const originalEnv = {
  packs: process.env.PACKS_DIR,
  data: process.env.DATA_DIR,
};
async function waitFor(predicate: () => boolean, timeout = 4000) {
  const until = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > until) throw new Error("Timed out waiting for state.");
    await new Promise((r) => setTimeout(r, 10));
  }
}
const me = (room: Connection) => room.state.seats.get(room.sessionId)!;
async function player(code?: string, role = "player") {
  const sdk = new Client(endpoint);
  const room = code
    ? await sdk.joinById<FastestRoomState>(code, {
        name: `Guest${++guestNumber}`,
        role,
      })
    : await sdk.create<FastestRoomState>("fastest-finger-first", {
        name: "Host",
        playerKey: "test-host-key-0001",
      });
  clients.push(room);
  await waitFor(() => Boolean(room.state?.game && me(room)));
  return room;
}
async function command(room: Connection, type: string, payload: object = {}) {
  const revision = room.state.game.revision;
  const reply = await room.request<unknown, Reply>(type, {
    revision,
    ...payload,
  });
  if (reply.ok) await waitFor(() => room.state.game.revision > revision);
  return reply;
}
const buzz = (room: Connection, scope = room.state.game.scope) =>
  room.request<unknown, Reply>("buzz", { scope });
async function prepare() {
  const host = await player(),
    alice = await player(host.roomId),
    bob = await player(host.roomId),
    tv = await player(host.roomId, "display");
  expect((await command(host, "newGame", { pack: "test-pack" })).ok).toBe(true);
  expect((await command(host, "startQuestion", { question: "one" })).ok).toBe(
    true,
  );
  await waitFor(
    () =>
      alice.state.game.phase === "ready" &&
      bob.state.game.phase === "ready" &&
      tv.state.game.phase === "ready",
  );
  return { host, alice, bob, tv };
}
async function writePack(id: string, questions: unknown[]) {
  const directory = join(data, "packs", id);
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, "questions.yaml"),
    JSON.stringify({ title: id, questions }),
  );
}
const questions = [
  { id: "one", prompt: "Question one", answer: "PRIVATE ONE" },
  { id: "two", prompt: "Question two", answer: "PRIVATE TWO" },
  { id: "three", prompt: "Question three", answer: "PRIVATE THREE" },
];
beforeAll(async () => {
  data = await mkdtemp(join(tmpdir(), "party-fastest-"));
  process.env.DATA_DIR = join(data, "data");
  process.env.PACKS_DIR = join(data, "packs");
  await writePack("test-pack", questions);
  await application.server.listen(0, "127.0.0.1");
  endpoint =
    "http://127.0.0.1:" + (application.http.address() as AddressInfo).port;
});
afterEach(async () => {
  await Promise.all(clients.map((c) => c.leave().catch(() => undefined)));
  clients = [];
});
afterAll(async () => {
  await application.server.gracefullyShutdown(false);
  closeDatabase();
  await rm(data, { recursive: true, force: true });
  if (originalEnv.packs === undefined) delete process.env.PACKS_DIR;
  else process.env.PACKS_DIR = originalEnv.packs;
  if (originalEnv.data === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalEnv.data;
});
describe("Fastest Finger First with real phones and TV", () => {
  it("opens automatically after the countdown while keeping early players locked out", async () => {
    const { host, alice, bob, tv } = await prepare();
    expect(tv.state.game.countdown).toBe(3);
    expect((await buzz(alice)).ok).toBe(true);
    await waitFor(() => host.state.game.locks.has(me(alice)));
    await waitFor(() => tv.state.game.phase === "open", 5000);
    expect(tv.state.game.countdown).toBe(0);
    expect((await buzz(alice)).ok).toBe(false);
    expect((await buzz(bob)).ok).toBe(true);
    await waitFor(() => host.state.game.phase === "answering");
    expect(host.state.game.answering).toBe(me(bob));
  });
  it("keeps answers private, rejects unauthorized controls, locks early buzzes, and admits late arrivals on the next question", async () => {
    const { host, alice, bob, tv } = await prepare();
    expect(host.state.game.host.answer).toBe("PRIVATE ONE");
    for (const guest of [alice, bob, tv]) {
      expect(guest.state.game.host.answer).toBeUndefined();
      expect(guest.state.game.host.questions).toBeUndefined();
      expect(JSON.stringify(guest.state.toJSON())).not.toContain("PRIVATE");
      expect((await command(guest, "openBuzzers")).ok).toBe(false);
    }
    expect((await buzz(host)).ok).toBe(false);
    expect((await buzz(tv)).ok).toBe(false);
    expect((await buzz(alice)).ok).toBe(true);
    await waitFor(() => host.state.game.locks.has(me(alice)));
    expect(host.state.game.stats.get(me(alice))?.score).toBe(0);
    const late = await player(host.roomId);
    expect(late.state.players.get(me(late))?.waiting).toBe(true);
    await command(host, "openBuzzers");
    await waitFor(() => bob.state.game.phase === "open");
    expect((await buzz(alice)).ok).toBe(false);
    expect((await buzz(late)).ok).toBe(false);
    await buzz(bob);
    await waitFor(() => host.state.game.phase === "answering");
    await command(host, "judge", { correct: false });
    await command(host, "reopen");
    expect(host.state.game.locks.has(me(alice))).toBe(true);
    expect(host.state.game.locks.has(me(bob))).toBe(true);
    await command(host, "reveal");
    await waitFor(() => tv.state.game.answer === "PRIVATE ONE");
    expect(
      (await command(host, "scoring", { reward: 100, penalty: 100 })).ok,
    ).toBe(false);
    expect((await command(host, "reopen")).ok).toBe(false);
    expect((await command(host, "openBuzzers")).ok).toBe(false);
    await command(host, "startQuestion", { question: "two" });
    await waitFor(() => !late.state.players.get(me(late))?.waiting);
    expect(host.state.game.roster.includes(me(late))).toBe(true);
    expect(host.state.game.locks.size).toBe(0);
  });
  it("awards one simultaneous buzz, uses fresh races, protects stale commands, recalculates points, undoes verdicts, and saves a fresh replay", async () => {
    const { host, alice, bob, tv } = await prepare();
    await command(host, "openBuzzers");
    await waitFor(
      () =>
        alice.state.game.phase === "open" && bob.state.game.phase === "open",
    );
    const oldScope = alice.state.game.scope;
    await Promise.all([buzz(alice), buzz(bob)]);
    await waitFor(() => host.state.game.phase === "answering");
    const winnerId = host.state.game.answering;
    const winner = me(alice) === winnerId ? alice : bob,
      other = winner === alice ? bob : alice;
    expect(
      [...host.state.game.stats.values()].reduce((sum, p) => sum + p.buzzes, 0),
    ).toBe(1);
    const staleRevision = host.state.game.revision;
    await command(host, "judge", { correct: false });
    expect(
      (
        await command(host, "judge", {
          correct: false,
          revision: staleRevision,
        })
      ).ok,
    ).toBe(false);
    expect(host.state.game.stats.get(winnerId)?.score).toBe(-5);
    await command(host, "editScore", { player: winnerId, total: 0 });
    await command(host, "scoring", { reward: 20, penalty: 8 });
    expect(host.state.game.stats.get(winnerId)?.score).toBe(-3);
    expect(host.state.game.stats.get(winnerId)?.adjustment).toBe(5);
    await command(host, "undo");
    expect(host.state.game.stats.get(winnerId)?.score).toBe(5);
    expect(host.state.game.stats.get(winnerId)?.wrong).toBe(0);
    expect(host.state.game.locks.has(winnerId)).toBe(false);
    expect((await buzz(other, oldScope)).ok).toBe(false);
    await command(host, "openBuzzers");
    await waitFor(() => winner.state.game.phase === "open");
    await buzz(winner);
    await waitFor(() => host.state.game.phase === "answering");
    await command(host, "judge", { correct: false });
    await command(host, "reopen");
    expect(host.state.game.phase).toBe("ready");
    await command(host, "openBuzzers");
    await waitFor(() => other.state.game.phase === "open");
    expect((await buzz(winner)).ok).toBe(false);
    expect((await buzz(other)).ok).toBe(true);
    await waitFor(() => host.state.game.phase === "answering");
    await command(host, "judge", { correct: true });
    expect(host.state.game.stats.get(me(other))?.score).toBe(20);
    await command(host, "scoring", { reward: 30, penalty: 10 });
    expect(host.state.game.stats.get(winnerId)?.score).toBe(-5);
    expect(host.state.game.stats.get(me(other))?.score).toBe(30);
    await command(host, "startQuestion", { question: "two" });
    await command(host, "scoring", { reward: 100, penalty: 100 });
    expect(host.state.game.stats.get(me(other))?.score).toBe(30);
    await command(host, "endGame");
    await command(host, "slide", { index: 3 });
    await waitFor(
      () => tv.state.game.slide === 3 && alice.state.game.phase === "ended",
    );
    expect((await command(tv, "slide", { index: 4 })).ok).toBe(false);
    const db = new DatabaseSync(join(data, "data", "party.sqlite"), {
      readOnly: true,
    });
    const saved = db
      .prepare("SELECT result_json FROM round_results WHERE room=?")
      .get(host.roomId) as { result_json: string };
    expect(JSON.parse(saved.result_json).stats[me(other)].score).toBe(30);
    db.close();
    await command(host, "newGame", { pack: "test-pack" });
    expect(host.state.game.game).toBe(2);
    expect(host.state.game.stats.get(me(other))?.score).toBe(0);
    expect(host.state.game.stats.get(winnerId)?.adjustment).toBe(0);
  });
  it("pauses only manually, preserves answering players, and never transfers private controls after the host hold expires", async () => {
    const { host, alice, tv } = await prepare();
    await command(host, "openBuzzers");
    await waitFor(() => alice.state.game.phase === "open");
    await buzz(alice);
    await waitFor(() => host.state.game.phase === "answering");
    await command(host, "pause");
    expect(host.state.game.answering).toBe(me(alice));
    expect((await command(host, "judge", { correct: true })).ok).toBe(false);
    await command(host, "resume");
    await command(host, "judge", { correct: false });
    await command(host, "reopen");
    await tv.leave();
    expect(host.state.game.paused).toBe(false);
    await command(host, "openBuzzers");
    const hostId = me(host),
      token = host.reconnectionToken;
    host.reconnection.enabled = false;
    host.connection.close(4001);
    await waitFor(() => alice.state.players.get(hostId)?.connected === false);
    expect(alice.state.game.paused).toBe(false);
    expect((await command(alice, "resume")).ok).toBe(false);
    const restored = await new Client(endpoint).reconnect<FastestRoomState>(
      token,
    );
    clients.push(restored);
    await waitFor(() => restored.state?.game?.host?.answer === "PRIVATE ONE");
    expect(restored.state.game.paused).toBe(false);
    expect(restored.state.game.phase).toBe("open");
    restored.reconnection.enabled = false;
    restored.connection.close(4001);
    await waitFor(() => alice.state.players.get(hostId)?.departed === true);
    expect(alice.state.hostId).toBe(hostId);
    expect(alice.state.game.host.answer).toBeUndefined();
    expect((await command(alice, "resume")).ok).toBe(false);
    const back = await new Client(endpoint).joinById<FastestRoomState>(
      host.roomId,
      { name: "Host again", playerKey: "test-host-key-0001" },
    );
    clients.push(back);
    await waitFor(() => back.state?.game?.host?.answer === "PRIVATE ONE");
    expect(me(back)).toBe(hostId);
  });
});
describe("external question packs", () => {
  it("snapshots media, keeps answers off HTTP, supports ranges, and loads later file edits only for later games", async () => {
    await writePack("media-pack", [
      {
        id: "image",
        prompt: "Look",
        answer: "OLD PRIVATE",
        type: "image",
        media: "clue.png",
      },
    ]);
    const source = join(data, "packs", "media-pack", "clue.png");
    await writeFile(source, Buffer.from("old image content"));
    const pack = await loadPack("media-pack");
    await writeFile(source, Buffer.from("new image content"));
    await writePack("media-pack", [
      {
        id: "image",
        prompt: "Look again",
        answer: "NEW PRIVATE",
        type: "image",
        media: "clue.png",
      },
    ]);
    expect(pack.questions[0].answer).toBe("OLD PRIVATE");
    const response = await fetch(endpoint + pack.media.get("clue.png"));
    expect(await response.text()).toBe("old image content");
    expect(response.headers.get("cache-control")).toContain("immutable");
    const partial = await fetch(endpoint + pack.media.get("clue.png"), {
      headers: { Range: "bytes=0-2" },
    });
    expect(partial.status).toBe(206);
    expect(await partial.text()).toBe("old");
    const newer = await loadPack("media-pack");
    expect(newer.questions[0].answer).toBe("NEW PRIVATE");
    expect(newer.media.get("clue.png")).not.toBe(pack.media.get("clue.png"));
    expect((await fetch(endpoint + "/fff-media/questions.yaml")).status).toBe(
      404,
    );
  });
  it("rejects traversal, symlink escapes, duplicate IDs, missing media and invalid clips while listing valid packs", async () => {
    await expect(loadPack("../test-pack")).rejects.toThrow();
    await writePack("duplicates", [questions[0], questions[0]]);
    await expect(loadPack("duplicates")).rejects.toThrow();
    await writePack("bad-media", [
      { ...questions[0], type: "video", media: "../../secret.mp4" },
    ]);
    await writeFile(join(data, "secret.mp4"), "secret");
    await expect(loadPack("bad-media")).rejects.toThrow();
    await symlink(
      join(data, "secret.mp4"),
      join(data, "packs", "bad-media", "clue.mp4"),
    );
    await writePack("bad-media", [
      { ...questions[0], type: "video", media: "clue.mp4" },
    ]);
    await expect(loadPack("bad-media")).rejects.toThrow();
    await writePack("bad-clip", [{ ...questions[0], start: 20, end: 10 }]);
    await expect(loadPack("bad-clip")).rejects.toThrow();
    const catalog = await listPacks();
    expect(catalog.packs.some((p) => p.id === "test-pack")).toBe(true);
    expect(catalog.errors.some((e) => e.includes("duplicates"))).toBe(true);
  });
});
