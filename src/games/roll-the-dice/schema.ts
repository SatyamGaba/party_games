import { schema, t } from "@colyseus/schema";
import { PartyState } from "../../platform/schema";
export const Guess = schema(
  {
    locked: t.boolean().default(false),
    value: t.number().default(0).view(),
    revealedValue: t.number().default(0),
  },
  "DiceGuess",
);
export const DiceGameState = schema(
  {
    phase: t.string().default("lobby"),
    round: t.number().default(0),
    roster: t.array("string"),
    skipped: t.array("string"),
    guesses: t.map(Guess),
    scores: t.map("number"),
    result: t.number().default(0),
    revealAt: t.number().default(0),
  },
  "DiceGame",
);
export const DiceRoomState = PartyState.extend(
  { game: t.ref(DiceGameState) },
  "DiceRoomState",
);
export type DiceRoomState = InstanceType<typeof DiceRoomState>;
