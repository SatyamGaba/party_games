import type { Client, Room } from "@colyseus/sdk";
import { create } from "zustand";
import { useEffect } from "react";
import type { Reply, Role, RoomSnapshot, SessionView } from "../contracts";
import { codeSchema, joinSchema } from "../validation";
import { sessionContext } from "./session-context";
import { clientError } from "../../lib/errors";
/**
 * Saved in localStorage (not sessionStorage) so closing the tab, a phone
 * discarding a backgrounded page, or the browser restarting doesn't turn a
 * returning player into a new one.
 */
const context = sessionContext(location.pathname, location.search);
const key = context.storageKey;
const deviceKey = "party.device.v1";
/** The server forgets a seat after this anyway; don't try to reclaim older ones. */
const maxAgeMs = 6 * 60 * 60 * 1000;
type SavedSession = {
  /** Colyseus room id, e.g. "roll-the-dice-ABCD". */
  roomId: string;
  token: string;
  role: Role;
  name: string;
  savedAt: number;
};
function readSession(): SavedSession | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      value &&
      typeof value === "object" &&
      "roomId" in value &&
      typeof value.roomId === "string" &&
      "token" in value &&
      typeof value.token === "string" &&
      "name" in value &&
      typeof value.name === "string" &&
      "savedAt" in value &&
      typeof value.savedAt === "number" &&
      Date.now() - value.savedAt < maxAgeMs &&
      "role" in value &&
      (value.role === "player" || value.role === "display") &&
      value.role === context.role &&
      (!context.requestedRoom || value.roomId === context.requestedRoom)
    )
      return value as SavedSession;
  } catch {
    /* Storage can be unavailable in private browsing. */
  }
  return null;
}
let memoryKey = "";
/** A random per-device secret the server uses to give a returning person their seat back. */
function playerKey() {
  try {
    let value = localStorage.getItem(deviceKey);
    if (!value || value.length < 16) {
      value = crypto.randomUUID();
      localStorage.setItem(deviceKey, value);
    }
    return value;
  } catch {
    return (memoryKey ||= crypto.randomUUID());
  }
}
function persist(room: Room, role: Role, name: string) {
  try {
    localStorage.setItem(
      key,
      JSON.stringify({
        roomId: room.roomId,
        token: room.reconnectionToken,
        role,
        name,
        savedAt: Date.now(),
      } satisfies SavedSession),
    );
  } catch {
    /* Live play still works. */
  }
}
function forget() {
  try {
    localStorage.removeItem(key);
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
  // Only "not ready" when there's a saved room to get back into.
  ready: !readSession(),
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
/** Room ids are "<gameId>-<code>"; game ids may contain dashes. */
const codeOfRoom = (roomId: string) =>
  roomId.slice(roomId.lastIndexOf("-") + 1);
const SERVER_CONSENTED = 4000;
function attach(room: Room, role: Role, name: string, generation: number) {
  active = room;
  persist(room, role, name);
  const update = () => {
    if (generation !== epoch) return;
    const state = room.state as { toJSON?(): unknown } | undefined;
    if (!state?.toJSON) return;
    const snapshot = state.toJSON() as RoomSnapshot;
    if (!snapshot.gameId || !snapshot.players) return;
    const you = snapshot.seats?.[room.sessionId];
    if (!you) return;
    useSessionStore.setState({
      room: { code: codeOfRoom(room.roomId), you, role, snapshot },
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
      persist(room, role, name);
      update();
    }
  });
  room.onLeave((code, reason) => {
    if (generation !== epoch) return;
    active = null;
    if (code === SERVER_CONSENTED && reason === "replaced") {
      // This person rejoined from another tab or device; that one now owns the seat.
      forget();
      useSessionStore.setState({
        room: null,
        online: true,
        ready: true,
        error: "You rejoined this room from another tab or device.",
      });
      return;
    }
    // The SDK gave up retrying (e.g. a long tunnel or a server restart). Try
    // once more by player key before treating this person as gone.
    void rejoin(
      { roomId: room.roomId, token: "", role, name, savedAt: Date.now() },
      ++epoch,
    );
  });
  room.onError(() => {
    if (generation === epoch)
      useSessionStore.setState({
        error: "The room connection encountered an error.",
      });
  });
  update();
}
/**
 * Reconnect with the saved token (same connection, held seat). If that fails,
 * join the room again with this device's player key: the server gives back the
 * same participant, with their score and answers, as long as the room exists.
 */
async function rejoin(saved: SavedSession, generation: number) {
  entering = true;
  useSessionStore.setState({ online: false, ready: false });
  try {
    const sdkClient = await sdk();
    let room: Room;
    try {
      if (!saved.token) throw new Error("No reconnection token.");
      room = await sdkClient.reconnect(saved.token);
    } catch {
      room = await sdkClient.joinById(saved.roomId, {
        role: saved.role,
        name: saved.name,
        playerKey: playerKey(),
      });
    }
    if (generation !== epoch) {
      await room.leave();
      return;
    }
    attach(room, saved.role, saved.name, generation);
  } catch (error) {
    if (generation !== epoch) return;
    forget();
    const message = clientError(error);
    useSessionStore.setState({
      room: null,
      online: true,
      ready: true,
      error: /not found|disposed/i.test(message)
        ? "That room has ended. You can start or join another one."
        : "We couldn't get you back into the room: " + message,
    });
  } finally {
    entering = false;
  }
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
  const parsed = joinSchema.parse({ ...options, playerKey: playerKey() });
  if (!options.gameId && !options.joinGameId)
    throw new Error("Choose a game first.");
  entering = true;
  const generation = ++epoch;
  try {
    const room = options.gameId
      ? await (await sdk()).create(options.gameId, parsed)
      : await (
          await sdk()
        ).joinById(
          options.joinGameId + "-" + codeSchema.parse(options.code),
          parsed,
        );
    if (generation !== epoch) {
      await room.leave();
      return;
    }
    attach(room, parsed.role, parsed.name, generation);
  } finally {
    entering = false;
  }
}
export async function sendMessage(
  type: string,
  payload: unknown,
  options?: { timeoutMs?: number },
): Promise<Reply> {
  if (
    !active ||
    !useSessionStore.getState().ready ||
    !useSessionStore.getState().online
  )
    throw new Error("Waiting to reconnect…");
  const reply = await active.request<unknown, Reply>(type, payload, {
    timeout: Math.min(120000, Math.max(1000, options?.timeoutMs ?? 7000)),
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
    void rejoin(saved, ++epoch);
  }, []);
  return { ...store, send: sendMessage, leave: leaveRoom };
}
