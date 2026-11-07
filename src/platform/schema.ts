import { schema, t } from "@colyseus/schema";
export const ParticipantState = schema(
  {
    /** Stable for the life of the room, even when the person rejoins on a new connection. */
    id: t.string().default(""),
    name: t.string().default(""),
    role: t.string().default("player"),
    connected: t.boolean().default(true),
    departed: t.boolean().default(false),
    /** Joined mid-game; admitted when the game next accepts new players. */
    waiting: t.boolean().default(false),
  },
  "Participant",
);
export type ParticipantState = InstanceType<typeof ParticipantState>;
export const PartyState = schema(
  {
    gameId: t.string().default(""),
    hostId: t.string().default(""),
    screenId: t.string().default(""),
    /** Keyed by participant id. */
    players: t.map(ParticipantState),
    /** Live connection sessionId -> participant id. */
    seats: t.map("string"),
  },
  "PartyState",
);
export type PartyState = InstanceType<typeof PartyState>;
