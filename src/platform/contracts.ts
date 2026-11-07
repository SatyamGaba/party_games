export type Role = "player" | "display";
export interface Participant {
  id: string;
  name: string;
  connected: boolean;
  departed: boolean;
  role: Role;
}
export interface RoomSnapshot {
  gameId: string;
  hostId: string;
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
