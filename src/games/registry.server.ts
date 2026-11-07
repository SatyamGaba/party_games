import { DiceRoom } from "./roll-the-dice/server";
import { UndercoverRoom } from "./undercover/server";
import { FastestRoom } from "./fastest-finger-first/server";
export const serverGames = {
  "roll-the-dice": DiceRoom,
  undercover: UndercoverRoom,
  "fastest-finger-first": FastestRoom,
};
