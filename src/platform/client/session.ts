import type { Client, Room } from "@colyseus/sdk";
import { create } from "zustand";
import { useEffect } from "react";
import type { Reply, Role, RoomSnapshot, SessionView } from "../contracts";
import { codeSchema, joinSchema } from "../validation";
import { clientError } from "../../lib/errors";
const key = "party.session.v1";
type SavedSession = { token: string; role: Role };
function readSession(): SavedSession | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (
      value &&
      typeof value === "object" &&
      "token" in value &&
      typeof value.token === "string" &&
      "role" in value &&
      (value.role === "player" || value.role === "display")
    )
      return value as SavedSession;
  } catch {
    /* Storage can be unavailable in private browsing. */
  }
  return null;
}
function persist(room: Room, role: Role) {
  try {
    sessionStorage.setItem(
      key,
      JSON.stringify({ token: room.reconnectionToken, role }),
    );
  } catch {
    /* Live play still works. */
  }
}
function forget() {
  try {
    sessionStorage.removeItem(key);
  } catch {
    /* No saved session. */
  }
}
interface SessionStore {
  room: SessionView | null;
  online: boolean;
  ready: boolean;
  error: string;
  setError(error: string): void;
}
export const useSessionStore = create<SessionStore>((set) => ({
  room: null,
  online: true,
  ready: false,
  error: "",
  setError: (error) => set({ error }),
}));
let active: Room | null = null;
let client: Promise<Client> | null = null;
let epoch = 0;
let entering = false;
function sdk() {
  return (client ??= import("@colyseus/sdk").then(
    ({ Client }) => new Client(location.origin),
  ));
}
function attach(room: Room, role: Role, generation: number) {
  active = room;
  persist(room, role);
  const update = () => {
    if (generation !== epoch) return;
    const state = room.state as { toJSON?(): unknown } | undefined;
    if (!state?.toJSON) return;
    const snapshot = state.toJSON() as RoomSnapshot;
    if (!snapshot.gameId || !snapshot.players) return;
    useSessionStore.setState({
      room: { code: room.roomId.slice(room.roomId.lastIndexOf("-") + 1), you: room.sessionId, role, snapshot },
      online: true,
      ready: true,
      error: "",
    });
  };
  room.onStateChange(update);
  room.onDrop(() => {
    if (generation === epoch)
      useSessionStore.setState({ online: false, ready: false });
  });
  room.onReconnect(() => {
    if (generation === epoch) {
      persist(room, role);
      update();
    }
  });
  room.onLeave(() => {
    if (generation !== epoch) return;
    active = null;
    forget();
    useSessionStore.setState({
      room: null,
      online: true,
      ready: true,
      error: "Your room session ended. You can join again.",
    });
  });
  room.onError(() => {
    if (generation === epoch)
      useSessionStore.setState({
        error: "The room connection encountered an error.",
      });
  });
  update();
}
export async function enterRoom(options: {
  /** Create a new room of this game. */
  gameId?: string;
  /** Join an existing room of this game by its code. */
  joinGameId?: string;
  code?: string;
  role: Role;
  name: string;
}) {
  if (entering || active)
    throw new Error("A room is already open or connecting.");
  const parsed = joinSchema.parse(options);
  if (!options.gameId && !options.joinGameId)
    throw new Error("Choose a game first.");
  entering = true;
  const generation = ++epoch;
  try {
    const room = options.gameId
      ? await (await sdk()).create(options.gameId, parsed)
      : await (await sdk()).joinById(
          options.joinGameId + "-" + codeSchema.parse(options.code),
          parsed,
        );
    if (generation !== epoch) {
      await room.leave();
      return;
    }
    attach(room, parsed.role, generation);
  } finally {
    entering = false;
  }
}
export async function sendMessage(
  type: string,
  payload: unknown,
): Promise<Reply> {
  if (
    !active ||
    !useSessionStore.getState().ready ||
    !useSessionStore.getState().online
  )
    throw new Error("Waiting to reconnect…");
  const reply = await active.request<unknown, Reply>(type, payload, {
    timeout: 7000,
  });
  if (!reply.ok) throw new Error(reply.error ?? "Please try again.");
  return reply;
}
export function answerSubmission(
  session: SessionView,
  scope: string,
  answer: unknown,
) {
  return {
    scope,
    answer,
    submissionId: session.code + ":" + session.you + ":" + scope,
  };
}
export function leaveRoom() {
  ++epoch;
  const room = active;
  const home =
    useSessionStore.getState().room?.role === "display" ? "/tv" : "/";
  active = null;
  forget();
  useSessionStore.setState({
    room: null,
    online: true,
    ready: true,
    error: "",
  });
  void room?.leave();
  history.replaceState(null, "", home);
}
let booted = false;
export function useRoomConnection() {
  const store = useSessionStore();
  useEffect(() => {
    if (booted) return;
    booted = true;
    const saved = readSession();
    if (!saved) {
      useSessionStore.setState({ ready: true });
      return;
    }
    const generation = ++epoch;
    entering = true;
    sdk()
      .then((client) => client.reconnect(saved.token))
      .then((room) => {
        if (generation !== epoch) {
          void room.leave();
          return;
        }
        attach(room, saved.role, generation);
      })
      .catch((error) => {
        if (generation !== epoch) return;
        forget();
        useSessionStore.setState({ ready: true, error: clientError(error) });
      })
      .finally(() => {
        entering = false;
      });
  }, []);
  return { ...store, send: sendMessage, leave: leaveRoom };
}
