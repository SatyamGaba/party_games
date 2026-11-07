import { randomInt } from "node:crypto";
import { Room, ServerError, type Client } from "@colyseus/core";
import { StateView } from "@colyseus/schema";
import type { ZodType } from "zod";
import { PartyState, ParticipantState } from "../schema";
import { joinSchema } from "../validation";
import { LIMITS } from "../../lib/config";
import { UserError, publicError } from "../../lib/errors";
import { log } from "../../lib/log";
import type { Reply } from "../contracts";
/** Room codes are unique within a game, not across the whole app. */
const codesByGame = new Map<string, Set<string>>();
function allocateCode(gameId: string) {
  let codes = codesByGame.get(gameId);
  if (!codes) codesByGame.set(gameId, (codes = new Set()));
  if (codes.size >= 100)
    throw new ServerError(503, "Too many active rooms. Try again shortly.");
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
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
export const codeOf = (roomId: string) => roomId.slice(roomId.lastIndexOf("-") + 1);
/** App lifecycle helpers only. No game rules, scoring, or game-specific messages. */
export abstract class PartyRoom<S extends PartyState> extends Room<{
  state: S;
}> {
  maxClients = LIMITS.clients;
  maxMessagesPerSecond = LIMITS.messagesPerSecond;
  patchRate = 50;
  /** Games without a shared-screen view set this to false. */
  protected allowsDisplay = true;
  protected abstract initialState(): S;
  protected abstract configure(): void;
  protected participantLeft(_id: string): void {}
  protected participantJoined(_client: Client): void {}
  onCreate() {
    this.setState(this.initialState());
    this.roomId = roomIdFor(this.state.gameId, allocateCode(this.state.gameId));
    this.setPrivate(true);
    this.configure();
    log("room_created", { room: this.roomId, game: this.state.gameId });
  }
  onAuth(_client: Client, options: unknown) {
    const parsed = joinSchema.safeParse(options);
    if (!parsed.success)
      throw new ServerError(400, parsed.error.issues[0].message);
    if (parsed.data.role === "display" && !this.allowsDisplay)
      throw new ServerError(400, "This game is played on phones only.");
    if (
      parsed.data.role === "player" &&
      [...this.state.players.values()].filter(
        (p) => p.role === "player" && !p.departed,
      ).length >= LIMITS.players
    )
      throw new ServerError(400, "This room has 24 players already.");
    return parsed.data;
  }
  onJoin(client: Client, options: unknown) {
    const { role, name } = joinSchema.parse(options);
    const participant = new ParticipantState().assign({
      id: client.sessionId,
      name: role === "display" ? "Shared screen" : name,
      role,
    });
    this.state.players.set(client.sessionId, participant);
    client.view = new StateView();
    if (role === "player" && !this.state.hostId)
      this.state.hostId = client.sessionId;
    // A screen that creates the room hosts it alongside the first phone.
    if (role === "display" && !this.state.screenId)
      this.state.screenId = client.sessionId;
    this.participantJoined(client);
    log("participant_joined", {
      room: this.roomId,
      count: this.clients.length,
    });
  }
  protected reconnectSeconds: number = LIMITS.reconnectSeconds;
  onDrop(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = false;
    this.allowReconnection(client, this.reconnectSeconds);
  }
  onReconnect(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) player.connected = true;
    this.participantJoined(client);
  }
  onLeave(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.connected = false;
      player.departed = true;
    }
    if (this.state.hostId === client.sessionId)
      this.state.hostId = this.connectedPlayers()[0]?.id ?? "";
    this.participantLeft(client.sessionId);
  }
  onDispose() {
    codesByGame.get(this.state.gameId)?.delete(codeOf(this.roomId));
    log("room_disposed", { room: this.roomId });
  }
  protected connectedPlayers() {
    return [...this.state.players.values()].filter(
      (p) => p.role === "player" && p.connected,
    );
  }
  protected requirePlayer(client: Client) {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.role !== "player" || !player.connected)
      throw new UserError("Join as a player first.");
    return player;
  }
  protected requireHost(client: Client) {
    if (client.sessionId === this.state.screenId) return;
    this.requirePlayer(client);
    if (client.sessionId !== this.state.hostId)
      throw new UserError("Only the host can start a round.");
  }
  protected registerMessage<T>(
    type: string,
    schema: ZodType<T>,
    handler: (client: Client, payload: T) => void,
  ) {
    this.onMessage(type, (client: Client, payload: unknown): Reply => {
      try {
        handler(client, schema.parse(payload));
        return { ok: true };
      } catch (error) {
        return { ok: false, error: publicError(error) };
      }
    });
  }
}
