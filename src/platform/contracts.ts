export type Role = "player" | "display";
export interface Participant {
  id: string;
  name: string;
  connected: boolean;
  departed: boolean;
  role: Role;
}
export interface GameManifest {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  /** Whether the game has a shared-screen view a TV can host from. */
  tv: boolean;
}
export interface RoomSnapshot {
  gameId: string;
  hostId: string;
  /** The shared screen that created and hosts the room, if any. */
  screenId: string;
  players: Record<string, Participant>;
  game: unknown;
}
export interface Reply {
  ok: boolean;
  error?: string;
}
export interface SessionView {
  code: string;
  you: string;
  role: Role;
  snapshot: RoomSnapshot;
}
export interface GameScreenProps {
  session: SessionView;
  connected: boolean;
  send(type: string, payload: unknown): Promise<Reply>;
}
