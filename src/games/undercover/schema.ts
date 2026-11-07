import { schema, t } from "@colyseus/schema";
import { PartyState } from "../../platform/schema";

/** A player's own word. Only the owner (and a Reveal-roles host) has it in view. */
export const Card = schema(
  {
    word: t.string().default("").view(),
    /** Only Mr. White is told their role. */
    white: t.boolean().default(false).view(),
  },
  "UndercoverCard",
);
/** Full role, for a host in Reveal-roles mode only. */
export const RoleCard = schema(
  { role: t.string().default("").view() },
  "UndercoverRole",
);
/** Whether someone voted is public; who they voted for is not until the Vote closes. */
export const Ballot = schema(
  {
    cast: t.boolean().default(false),
    target: t.string().default("").view(),
  },
  "UndercoverBallot",
);
export const Clue = schema(
  {
    round: t.number().default(0),
    by: t.string().default(""),
    text: t.string().default(""),
    /** The turn passed without a clue (timer ran out, skipped, or disconnected). */
    skipped: t.boolean().default(false),
  },
  "UndercoverClue",
);
/** Public after the game ends. */
export const Reveal = schema(
  { role: t.string().default(""), word: t.string().default("") },
  "UndercoverReveal",
);
export const Settings = schema(
  {
    clueMode: t.string().default("spoken"),
    turnSeconds: t.number().default(30),
    discussionSeconds: t.number().default(90),
    moderatorView: t.string().default("reveal"),
    /** "suggested" follows the player count; "custom" uses the counts below; "random". */
    splitMode: t.string().default("suggested"),
    undercover: t.number().default(1),
    white: t.number().default(0),
    /** Built-in categories in play; empty means all. */
    categories: t.array("string"),
  },
  "UndercoverSettings",
);
export const UndercoverGameState = schema(
  {
    phase: t.string().default("lobby"),
    /** Games played in this room. */
    game: t.number().default(0),
    round: t.number().default(0),
    settings: t.ref(Settings),
    /** Players dealt into the current game, in seat order. */
    roster: t.array("string"),
    /** Ousted players, in order. */
    out: t.array("string"),
    /** Role reveals of players ousted by a Vote. Departures stay hidden. */
    revealed: t.map("string"),
    cards: t.map(Card),
    roles: t.map(RoleCard),
    ready: t.array("string"),
    order: t.array("string"),
    turn: t.number().default(0),
    deadline: t.number().default(0),
    clues: t.array(Clue),
    ballots: t.map(Ballot),
    /** Empty means everyone remaining is a candidate. */
    candidates: t.array("string"),
    tieBreak: t.boolean().default(false),
    /** Last closed Vote. */
    tally: t.map("number"),
    lastVotes: t.map("string"),
    outcome: t.string().default(""),
    lastOusted: t.string().default(""),
    guessBy: t.string().default(""),
    guessText: t.string().default(""),
    guessCorrect: t.boolean().default(false),
    winningSide: t.string().default(""),
    winners: t.array("string"),
    final: t.map(Reveal),
    civilianWord: t.string().default(""),
    undercoverWord: t.string().default(""),
    scores: t.map("number"),
  },
  "UndercoverGame",
);
export const UndercoverRoomState = PartyState.extend(
  { game: t.ref(UndercoverGameState) },
  "UndercoverRoomState",
);
export type UndercoverRoomState = InstanceType<typeof UndercoverRoomState>;
