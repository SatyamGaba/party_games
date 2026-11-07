import type { Role } from "../contracts";

/** Phone and display tabs share device identity, but must not share a reconnecting seat. */
export function sessionContext(pathname: string, search: string) {
  const params = new URLSearchParams(search);
  const role: Role =
    pathname === "/tv" || params.get("screen") === "tv" ? "display" : "player";
  const game = params.get("game"),
    code = params.get("room")?.trim().toUpperCase();
  return {
    role,
    storageKey: "party.session.v2" + (role === "display" ? ".display" : ""),
    requestedRoom: game && code ? game + "-" + code : null,
  };
}
