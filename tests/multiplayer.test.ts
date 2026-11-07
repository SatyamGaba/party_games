import { beforeAll, afterAll, afterEach, describe, expect, it } from "vitest";
import { Client, type Room } from "@colyseus/sdk";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { DatabaseSync } from "node:sqlite";
import { DiceRoom } from "../src/games/roll-the-dice/server";
import type { DiceRoomState } from "../src/games/roll-the-dice/schema";
import { createPartyServer } from "../src/platform/server/create-server";
import { closeDatabase } from "../src/storage/database";
import type { Reply } from "../src/platform/contracts";
class TestDiceRoom extends DiceRoom {
  protected roll() {
    return 5;
  }
  protected rollDelayMs = 80;
  protected reconnectSeconds = 0.4;
  protected turnGraceMs = 300;
}
const application = createPartyServer({ "roll-the-dice": TestDiceRoom });
const data = mkdtempSync(join(tmpdir(), "party-tests-"));
let endpoint: string;
let clients: Room<unknown, DiceRoomState>[] = [];
async function waitFor(predicate: () => boolean, timeout = 4000) {
  const until = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > until) throw new Error("Timed out waiting for state.");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
function me(room: Room<unknown, DiceRoomState>) {
  return room.state.seats.get(room.sessionId) ?? "";
}
async function player(code?: string, role = "player") {
  const sdk = new Client(endpoint);
  const room = code
    ? await sdk.joinById<DiceRoomState>(code, { name: "Guest", role })
    : await sdk.create<DiceRoomState>("roll-the-dice", { name: "Host" });
  clients.push(room);
  await waitFor(() => Boolean(room.state?.game));
  return room;
}
async function request(
  room: Room<unknown, DiceRoomState>,
  type: string,
  payload: unknown = {},
) {
  return room.request<unknown, Reply>(type, payload);
}
function bet(room: Room<unknown, DiceRoomState>, value: number, round = 1) {
  return request(room, "submit", {
    scope: String(round),
    submissionId: room.sessionId + ":" + round,
    answer: value,
  });
}
beforeAll(async () => {
  process.env.DATA_DIR = data;
  await application.server.listen(0, "127.0.0.1");
  endpoint =
    "http://127.0.0.1:" + (application.http.address() as AddressInfo).port;
});
afterEach(async () => {
  await Promise.all(clients.map((room) => room.leave().catch(() => undefined)));
  clients = [];
});
afterAll(async () => {
  await application.server.gracefullyShutdown(false);
  closeDatabase();
  rmSync(data, { recursive: true, force: true });
});
describe("real Colyseus clients", () => {
  it("serves health and validates joining", async () => {
    expect((await fetch(endpoint + "/health")).ok).toBe(true);
    await expect(
      new Client(endpoint).create("roll-the-dice", { name: "" }),
    ).rejects.toThrow();
  });
  it("keeps guesses private on phones and TV, rolls once, scores ties, and persists results", async () => {
    const host = await player();
    const guest = await player(host.roomId);
    const tv = await player(host.roomId, "display");
    expect(host.roomId).toMatch(/^roll-the-dice-[A-HJ-NP-Z2-9]{4}$/);
    expect((await request(guest, "start")).ok).toBe(false);
    expect((await request(tv, "start")).ok).toBe(true);
    await waitFor(() => guest.state.game.phase === "betting");
    expect((await bet(tv, 5)).ok).toBe(false);
    expect((await bet(host, 7)).ok).toBe(false);
    expect((await bet(host, 5)).ok).toBe(true);
    expect((await bet(host, 5)).ok).toBe(true);
    expect((await bet(host, 3)).ok).toBe(false);
    await waitFor(
      () => tv.state.game.guesses.get(me(host))?.locked === true,
    );
    expect(host.state.game.guesses.get(me(host))?.value).toBe(5);
    expect(guest.state.game.guesses.get(me(host))?.value).toBeUndefined();
    expect(tv.state.game.guesses.get(me(host))?.value).toBeUndefined();
    expect(tv.state.game.guesses.get(me(host))?.revealedValue).toBe(0);
    expect(tv.state.game.result).toBe(0);
    expect((await bet(guest, 5)).ok).toBe(true);
    await waitFor(() => host.state.game.phase === "result");
    expect(host.state.game.result).toBe(5);
    expect(host.state.game.scores.get(me(host))).toBe(10);
    expect(host.state.game.scores.get(me(guest))).toBe(10);
    expect(tv.state.game.guesses.get(me(host))?.revealedValue).toBe(5);
    expect(tv.state.game.guesses.get(me(host))?.value).toBeUndefined();
    await bet(guest, 5);
    expect(host.state.game.scores.get(me(guest))).toBe(10);
    const db = new DatabaseSync(join(data, "party.sqlite"), { readOnly: true });
    expect(
      (
        db
          .prepare("SELECT COUNT(*) AS count FROM round_results WHERE room=?")
          .get(host.roomId) as { count: number }
      ).count,
    ).toBe(1);
    db.close();
    expect((await request(host, "start")).ok).toBe(true);
    await waitFor(() => guest.state.game.round === 2);
    expect(guest.state.game.result).toBe(0);
    expect(guest.state.game.guesses.get(me(host))?.value).toBeUndefined();
    expect((await bet(guest, 5, 1)).ok).toBe(false);
    await bet(host, 5, 2);
    await bet(guest, 1, 2);
    await waitFor(() => host.state.game.phase === "result");
    expect(host.state.game.scores.get(me(host))).toBe(20);
    expect(host.state.game.scores.get(me(guest))).toBe(10);
  });
  it("defers late arrivals, skips unanswered departed players, and transfers the host", async () => {
    const host = await player();
    const guest = await player(host.roomId);
    await request(host, "start");
    const late = await player(host.roomId);
    expect(late.state.players.get(me(late))?.waiting).toBe(true);
    expect((await bet(late, 5)).ok).toBe(false);
    await bet(guest, 5);
    const hostId = me(host);
    await host.leave();
    await waitFor(
      () =>
        guest.state.hostId === me(guest) &&
        guest.state.game.phase === "result",
    );
    expect(guest.state.game.skipped.includes(hostId)).toBe(true);
    expect(guest.state.game.scores.get(me(guest))).toBe(10);
    await waitFor(() => late.state.players.get(me(late))?.waiting === false);
    await request(guest, "start");
    await waitFor(() => late.state.game.round === 2);
    expect(late.state.game.roster.includes(me(late))).toBe(true);
  });
  it("restores a private locked answer after a page-reload style reconnect", async () => {
    const host = await player();
    const guest = await player(host.roomId);
    await request(host, "start");
    await bet(host, 5);
    const token = host.reconnectionToken;
    const id = me(host);
    host.reconnection.enabled = false;
    host.connection.close(4001);
    await waitFor(() => guest.state.players.get(id)?.connected === false);
    const restored = await new Client(endpoint).reconnect<DiceRoomState>(token);
    clients.push(restored);
    await waitFor(() => restored.state?.game?.guesses.get(id)?.locked === true);
    expect(me(restored)).toBe(id);
    expect(restored.state.game.guesses.get(id)?.value).toBe(5);
    expect(guest.state.game.guesses.get(id)?.value).toBeUndefined();
  });
  async function keyed(code: string, playerKey: string, name = "Sam") {
    const room = await new Client(endpoint).joinById<DiceRoomState>(code, {
      name,
      playerKey,
    });
    clients.push(room);
    await waitFor(() => Boolean(room.state?.game && me(room)));
    return room;
  }
  it("gives a closed tab its seat, score and private answer back via the player key", async () => {
    const host = await player();
    const sam = await keyed(host.roomId, "sam-device-key-0001");
    const id = me(sam);
    await request(host, "start");
    await bet(sam, 5);
    // Tab closed: no reconnection token survives, only the device key.
    sam.reconnection.enabled = false;
    sam.connection.close(4001);
    await waitFor(() => host.state.players.get(id)?.connected === false);
    const back = await keyed(host.roomId, "sam-device-key-0001", "Sam again");
    expect(me(back)).toBe(id);
    expect(back.state.players.get(id)?.waiting).toBe(false);
    expect(back.state.players.get(id)?.connected).toBe(true);
    await waitFor(() => back.state.game.guesses.get(id)?.value === 5);
    expect(back.state.players.size).toBe(2);
    await bet(host, 5);
    await waitFor(() => host.state.game.phase === "result");
    expect(host.state.game.scores.get(id)).toBe(10);
  });
  it("lets a returning player in after the hold expired, mid-round, without the waiting room", async () => {
    const host = await player();
    const sam = await keyed(host.roomId, "sam-device-key-0002");
    const id = me(sam);
    await request(host, "start");
    await bet(sam, 2);
    await bet(host, 5);
    await waitFor(() => host.state.game.phase === "result");
    await request(host, "start");
    sam.reconnection.enabled = false;
    sam.connection.close(4001);
    await waitFor(() => host.state.players.get(id)?.departed === true);
    const back = await keyed(host.roomId, "sam-device-key-0002");
    expect(me(back)).toBe(id);
    expect(back.state.players.get(id)?.departed).toBe(false);
    expect(back.state.players.get(id)?.waiting).toBe(false);
  });
  it("takes the seat from a still-open old tab instead of duplicating the player", async () => {
    const host = await player();
    const old = await keyed(host.roomId, "sam-device-key-0003");
    const id = me(old);
    let reason = "";
    old.onLeave((_code, why) => (reason = why ?? ""));
    const fresh = await keyed(host.roomId, "sam-device-key-0003");
    expect(me(fresh)).toBe(id);
    await waitFor(() => reason === "replaced");
    expect(fresh.state.players.size).toBe(2);
    expect(fresh.state.players.get(id)?.connected).toBe(true);
    expect((await request(host, "start")).ok).toBe(true);
    expect((await bet(fresh, 5)).ok).toBe(true);
  });
  it("forgets the seat when a player presses Leave", async () => {
    const host = await player();
    const sam = await keyed(host.roomId, "sam-device-key-0004");
    const id = me(sam);
    await sam.leave();
    await waitFor(() => host.state.players.get(id)?.departed === true);
    const again = await keyed(host.roomId, "sam-device-key-0004");
    expect(me(again)).not.toBe(id);
  });
  it("drops a waiting player who disconnects without a trace", async () => {
    const host = await player();
    await request(host, "start");
    const late = await keyed(host.roomId, "late-device-key-01");
    const id = me(late);
    await waitFor(() => host.state.players.get(id)?.waiting === true);
    late.reconnection.enabled = false;
    late.connection.close(4001);
    await waitFor(() => !host.state.players.has(id));
  });
  it("lets a TV create and host a room alongside the first phone", async () => {
    const tv = await new Client(endpoint).create<DiceRoomState>(
      "roll-the-dice",
      { role: "display" },
    );
    clients.push(tv);
    await waitFor(() => Boolean(tv.state?.game));
    expect(tv.state.screenId).toBe(me(tv));
    expect(tv.state.hostId).toBe("");
    expect((await request(tv, "start")).ok).toBe(false);
    const phone = await player(tv.roomId);
    await waitFor(() => tv.state.hostId === me(phone));
    expect((await request(tv, "start")).ok).toBe(true);
    await waitFor(() => phone.state.game.phase === "betting");
    expect((await bet(tv, 5)).ok).toBe(false);
    const second = await player(tv.roomId, "display");
    expect((await request(second, "start")).ok).toBe(false);
  });
  it("makes a screen joining an existing room a co-host", async () => {
    const host = await player();
    const tv = await player(host.roomId, "display");
    expect(tv.state.screenId).toBe(me(tv));
    expect((await request(tv, "start")).ok).toBe(true);
  });
  it("counts only players toward the player limit", async () => {
    const host = await player();
    for (let i = 1; i < 24; i++) await player(host.roomId);
    await expect(
      new Client(endpoint).joinById(host.roomId, {
        name: "Overflow",
        role: "player",
      }),
    ).rejects.toThrow("24 players");
    const display = await player(host.roomId, "display");
    expect(display.state.players.get(me(display))?.role).toBe("display");
  });
  it("keeps an accepted guess eligible when its player leaves", async () => {
    const host = await player();
    const guest = await player(host.roomId);
    await request(host, "start");
    await bet(host, 5);
    const id = me(host);
    await host.leave();
    await bet(guest, 5);
    await waitFor(() => guest.state.game.phase === "result");
    expect(guest.state.game.scores.get(id)).toBe(10);
  });
  it("skips a dropped player's turn after the grace period, then frees the seat when the hold expires", async () => {
    const host = await player();
    const guest = await player(host.roomId);
    await request(host, "start");
    await bet(guest, 5);
    const id = me(host);
    host.reconnection.enabled = false;
    host.connection.close(4001);
    // Turn grace (300ms) unblocks the round while the seat is still held.
    await waitFor(() => guest.state.game.phase === "result");
    expect(guest.state.game.skipped.includes(id)).toBe(true);
    expect(guest.state.players.get(id)?.departed).toBe(false);
    expect(guest.state.players.get(id)?.connected).toBe(false);
    // The offline host shouldn't block everyone else from starting.
    expect((await request(guest, "start")).ok).toBe(true);
    // Hold (400ms) expires: the seat is released and hosting moves on.
    await waitFor(() => guest.state.players.get(id)?.departed === true);
    expect(guest.state.hostId).toBe(me(guest));
  });
});
