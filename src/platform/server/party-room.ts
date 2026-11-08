import { randomInt, randomUUID } from "node:crypto";
import {
  CloseCode,
  Room,
  ServerError,
  type Client,
  type Deferred,
} from "@colyseus/core";
import { StateView } from "@colyseus/schema";
import type { ZodType } from "zod";
import { PartyState, ParticipantState } from "../schema";
import { joinSchema } from "../validation";
import { LIMITS } from "../../lib/config";
import { UserError, publicError } from "../../lib/errors";
import { log } from "../../lib/log";
import type { LateJoin, Reply } from "../contracts";
/** Room codes are unique within a game, not across the whole app. */
const codesByGame = new Map<string, Set<string>>();
function allocateCode(gameId: string) {
  let codes = codesByGame.get(gameId);
  if (!codes) codesByGame.set(gameId, (codes = new Set()));
  if (codes.size >= 100)
    throw new ServerError(503, "Too many active rooms. Try again shortly.");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code: string;
  do {
    code = Array.from(
      { length: 4 },
      () => alphabet[randomInt(alphabet.length)],
    ).join("");
  } while (codes.has(code));
  codes.add(code);
  return code;
}
/** Colyseus room ids are global, so the per-game code is namespaced by game. */
export const roomIdFor = (gameId: string, code: string) => gameId + "-" + code;
export const codeOf = (roomId: string) =>
  roomId.slice(roomId.lastIndexOf("-") + 1);
/** Server-initiated close sent to a connection whose seat was reclaimed elsewhere. */
export const REPLACED_REASON = "replaced";
/**
 * App lifecycle helpers only. No game rules, scoring, or game-specific messages.
 *
 * Identity: every participant has a stable `id` for the life of the room. A
 * connection's `sessionId` maps to it through `state.seats`. Games must key all
 * per-player data by `idOf(client)`, never by `client.sessionId`, so that a
 * person who closes the tab and rejoins keeps their score, answers and host role.
 */
export abstract class PartyRoom<S extends PartyState> extends Room<{
  state: S;
}> {
  maxClients = LIMITS.clients;
  maxMessagesPerSecond: number = LIMITS.messagesPerSecond;
  patchRate = 50;
  /** Games without a shared-screen view set this to false. */
  protected allowsDisplay = true;
  /** Whether brand-new players wait in the waiting room while a round is in progress. */
  protected lateJoin: LateJoin = "anytime";
  /** How long a disconnected participant keeps their place. */
  protected reconnectSeconds: number = LIMITS.reconnectSeconds;
  protected abstract initialState(): S;
  protected abstract configure(): void;
  /** False while a round is in progress. Only consulted when `lateJoin` is "between-rounds". */
  protected acceptsNewPlayers(): boolean {
    return true;
  }
  /** A participant connected or reconnected (possibly on a new connection). */
  protected participantJoined(_client: Client, _id: string): void {}
  /** A participant lost their connection but still holds their seat. */
  protected participantDropped(_id: string): void {}
  /** A participant left for good: explicit leave, or their seat hold expired. */
  protected participantLeft(_id: string): void {}
  /** playerKey -> participant id. Kept server-side only; the key is a bearer secret. */
  private keys = new Map<string, string>();
  private keyOf = new Map<string, string>();
  /** participant id -> held seat of a dropped connection. */
  private holds = new Map<string, { sessionId: string; hold: Deferred }>();
  onCreate() {
    this.setState(this.initialState());
    this.roomId = roomIdFor(this.state.gameId, allocateCode(this.state.gameId));
    this.setPrivate(true);
    this.configure();
    log("room_created", { room: this.roomId, game: this.state.gameId });
  }
  /** Participant id of a connection, or "" if it holds no seat. */
  protected idOf(client: Client) {
    return this.state.seats.get(client.sessionId) ?? "";
  }
  /** The live connection of a participant, if any. */
  protected clientOf(id: string) {
    for (const [sessionId, seat] of this.state.seats)
      if (seat === id) return this.clients.getById(sessionId);
    return undefined;
  }
  private returning(role: string, playerKey?: string) {
    const id = playerKey ? this.keys.get(role + ":" + playerKey) : undefined;
    const participant = id ? this.state.players.get(id) : undefined;
    return participant?.role === role ? participant : undefined;
  }
  private holdsWaitingRoom() {
    return this.lateJoin === "between-rounds" && !this.acceptsNewPlayers();
  }
  onAuth(_client: Client, options: unknown) {
    const parsed = joinSchema.safeParse(options);
    if (!parsed.success)
      throw new ServerError(400, parsed.error.issues[0].message);
    if (parsed.data.role === "display" && !this.allowsDisplay)
      throw new ServerError(400, "This game is played on phones only.");
    const back = this.returning(parsed.data.role, parsed.data.playerKey);
    if (
      parsed.data.role === "player" &&
      !(back && !back.departed) &&
      [...this.state.players.values()].filter(
        (p) => p.role === "player" && !p.departed,
      ).length >= LIMITS.players
    )
      throw new ServerError(
        400,
        `This room has ${LIMITS.players} players already.`,
      );
    if (parsed.data.role === "player" && !back) {
      const wanted = parsed.data.name.trim().toLowerCase();
      for (const p of this.state.players.values())
        if (
          p.role === "player" &&
          !p.departed &&
          p.name.trim().toLowerCase() === wanted
        )
          throw new ServerError(
            400,
            "That name is already taken in this room. Pick another.",
          );
    }
    return parsed.data;
  }
  onJoin(client: Client, options: unknown) {
    const { role, name, playerKey } = joinSchema.parse(options);
    let participant = this.returning(role, playerKey);
    if (participant) {
      // Same person on a new connection: take the seat back from any stale one.
      // Returning players are never sent to the waiting room.
      this.release(participant.id);
      participant.departed = false;
      participant.connected = true;
      log("participant_rejoined", { room: this.roomId });
    } else {
      participant = new ParticipantState().assign({
        id: randomUUID(),
        name: role === "display" ? "Shared screen" : name,
        role,
        waiting: role === "player" && this.holdsWaitingRoom(),
      });
      this.state.players.set(participant.id, participant);
      if (playerKey) {
        // Per role: one device may be both a phone player and a TV in another tab.
        this.keys.set(role + ":" + playerKey, participant.id);
        this.keyOf.set(participant.id, role + ":" + playerKey);
      }
      log("participant_joined", {
        room: this.roomId,
        count: this.clients.length,
      });
    }
    const id = participant.id;
    this.state.seats.set(client.sessionId, id);
    client.view = new StateView();
    if (role === "player" && !participant.waiting && !this.state.hostId)
      this.state.hostId = id;
    // A screen that creates the room hosts it alongside the first phone.
    if (role === "display" && !this.state.screenId) this.state.screenId = id;
    this.participantJoined(client, id);
  }
  /** Detach whatever connection currently holds this participant's seat. */
  private release(id: string) {
    const stale = new Set<string>();
    for (const [sessionId, seat] of this.state.seats)
      if (seat === id) stale.add(sessionId);
    for (const sessionId of stale) this.state.seats.delete(sessionId);
    const held = this.holds.get(id);
    if (held) {
      this.holds.delete(id);
      held.hold.reject(false);
    }
    // e.g. the old tab is still open on another device: tell it, so it stops reconnecting.
    for (const other of this.clients)
      if (stale.has(other.sessionId))
        other.leave(CloseCode.CONSENTED, REPLACED_REASON);
  }
  onDrop(client: Client) {
    const id = this.idOf(client);
    const participant = this.state.players.get(id);
    if (!participant) return;
    participant.connected = false;
    const hold = this.allowReconnection(client, this.reconnectSeconds);
    this.holds.set(id, { sessionId: client.sessionId, hold });
    const done = () => {
      if (this.holds.get(id)?.sessionId === client.sessionId)
        this.holds.delete(id);
    };
    hold.then(done, done);
    this.participantDropped(id);
  }
  onReconnect(client: Client) {
    const id = this.idOf(client);
    const participant = this.state.players.get(id);
    if (!participant) return;
    participant.connected = true;
    if (
      participant.role === "player" &&
      !participant.waiting &&
      !this.state.hostId
    )
      this.state.hostId = id;
    this.participantJoined(client, id);
  }
  onLeave(client: Client, code?: number) {
    const id = this.idOf(client);
    // A connection whose seat was already reclaimed by a newer one.
    if (!id) return;
    this.state.seats.delete(client.sessionId);
    const participant = this.state.players.get(id);
    if (!participant) return;
    participant.connected = false;
    // Pressing "Leave" gives the seat up; an expired hold can still be reclaimed by key.
    if (code === CloseCode.CONSENTED) this.forgetKey(id);
    if (participant.waiting) {
      // Never took part, so there is nothing to keep.
      this.state.players.delete(id);
      this.forgetKey(id);
      return;
    }
    participant.departed = true;
    if (this.state.hostId === id)
      this.state.hostId = this.connectedPlayers()[0]?.id ?? "";
    this.participantLeft(id);
  }
  private forgetKey(id: string) {
    const key = this.keyOf.get(id);
    if (key) this.keys.delete(key);
    this.keyOf.delete(id);
  }
  /** Lets waiting players in as soon as the game accepts new players again. */
  protected admitWaiting() {
    if (this.holdsWaitingRoom()) return;
    for (const participant of this.state.players.values()) {
      if (!participant.waiting) continue;
      participant.waiting = false;
      if (!this.state.hostId && participant.connected)
        this.state.hostId = participant.id;
    }
  }
  onBeforePatch() {
    this.admitWaiting();
  }
  onDispose() {
    codesByGame.get(this.state.gameId)?.delete(codeOf(this.roomId));
    log("room_disposed", { room: this.roomId });
  }
  protected connectedPlayers() {
    return [...this.state.players.values()].filter(
      (p) => p.role === "player" && p.connected && !p.waiting,
    );
  }
  protected requirePlayer(client: Client) {
    const player = this.state.players.get(this.idOf(client));
    if (!player || player.role !== "player" || !player.connected)
      throw new UserError("Join as a player first.");
    if (player.waiting)
      throw new UserError("You're in the waiting room until this round ends.");
    return player;
  }
  protected requireHost(client: Client) {
    const id = this.idOf(client);
    if (id && id === this.state.screenId) return;
    this.requirePlayer(client);
    // A host who dropped mid-session shouldn't block everyone for the whole hold.
    const host = this.state.players.get(this.state.hostId);
    if (id !== this.state.hostId && host?.connected)
      throw new UserError("Only the host can start a round.");
  }
  protected registerMessage<T>(
    type: string,
    schema: ZodType<T>,
    handler: (client: Client, payload: T) => void | Promise<void>,
  ) {
    this.onMessage(
      type,
      async (client: Client, payload: unknown): Promise<Reply> => {
        try {
          this.admitWaiting();
          await handler(client, schema.parse(payload));
          return { ok: true };
        } catch (error) {
          return { ok: false, error: publicError(error) };
        }
      },
    );
  }
}
