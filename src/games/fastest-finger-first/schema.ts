import { schema, t } from "@colyseus/schema";
import { PartyState } from "../../platform/schema";
export const HostState = schema(
  {
    catalog: t.string().default("[]").view(),
    questions: t.string().default("[]").view(),
    prompt: t.string().default("").view(),
    answer: t.string().default("").view(),
    error: t.string().default("").view(),
  },
  "FastestHost",
);
export const Stats = schema(
  {
    score: t.number().default(0),
    adjustment: t.number().default(0),
    correct: t.number().default(0),
    wrong: t.number().default(0),
    early: t.number().default(0),
    buzzes: t.number().default(0),
  },
  "FastestStats",
);
export const FastestGameState = schema(
  {
    phase: t.string().default("lobby"),
    paused: t.boolean().default(false),
    countdown: t.number().default(0),
    revision: t.number().default(0),
    scope: t.string().default(""),
    game: t.number().default(0),
    pack: t.string().default(""),
    packTitle: t.string().default(""),
    questionId: t.string().default(""),
    questionNumber: t.number().default(0),
    totalQuestions: t.number().default(0),
    questionType: t.string().default("text"),
    text: t.string().default(""),
    mediaUrl: t.string().default(""),
    mediaStart: t.number().default(0),
    mediaEnd: t.number().default(0),
    mediaEpoch: t.number().default(0),
    answer: t.string().default(""),
    answering: t.string().default(""),
    verdict: t.string().default(""),
    reward: t.number().default(10),
    penalty: t.number().default(5),
    slide: t.number().default(0),
    roster: t.array("string"),
    locks: t.map("string"),
    stats: t.map(Stats),
    host: t.ref(HostState),
  },
  "FastestGame",
);
export const FastestRoomState = PartyState.extend(
  { game: t.ref(FastestGameState) },
  "FastestRoomState",
);
export type FastestRoomState = InstanceType<typeof FastestRoomState>;
