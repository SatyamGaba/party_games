export type Role = "player" | "display";
export interface Participant {
  id: string;
  name: string;
  connected: boolean;
  departed: boolean;
  /** In the waiting room until the current game lets new players in. */
  waiting: boolean;
  role: Role;
}
/**
 * - "anytime": new players take part straight away (the game decides what they can do).
 * - "between-rounds": new players wait in the waiting room while a round is in progress.
 */
export type LateJoin = "anytime" | "between-rounds";
export interface GameManifest {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  /** Whether the game has a shared-screen view a TV can host from. */
  tv: boolean;
  lateJoin: LateJoin;
  /** False when the host only moderates and doesn't play. Defaults to true. */
  hostPlays?: boolean;
}
export interface RoomSnapshot {
  gameId: string;
  hostId: string;
  /** The shared screen that created and hosts the room, if any. */
  screenId: string;
  players: Record<string, Participant>;
  seats: Record<string, string>;
  game: unknown;
}
export interface Reply {
  ok: boolean;
  error?: string;
}
export interface SessionView {
  code: string;
  /** Your stable participant id. It survives rejoining on a new connection. */
  you: string;
  role: Role;
  snapshot: RoomSnapshot;
}
export interface GameScreenProps {
  session: SessionView;
  connected: boolean;
  send(
    type: string,
    payload: unknown,
    options?: { timeoutMs?: number },
  ): Promise<Reply>;
}
