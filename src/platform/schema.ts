import { schema, t } from "@colyseus/schema";
export const ParticipantState = schema(
  {
    id: t.string().default(""),
    name: t.string().default(""),
    role: t.string().default("player"),
    connected: t.boolean().default(true),
    departed: t.boolean().default(false),
  },
  "Participant",
);
export type ParticipantState = InstanceType<typeof ParticipantState>;
export const PartyState = schema(
  {
    gameId: t.string().default(""),
    hostId: t.string().default(""),
    players: t.map(ParticipantState),
  },
  "PartyState",
);
export type PartyState = InstanceType<typeof PartyState>;
