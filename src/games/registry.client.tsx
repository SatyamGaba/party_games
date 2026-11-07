import { lazy, type ComponentType } from "react";
import type { GameScreenProps } from "../platform/contracts";
const DiceScreen = lazy(() =>
  import("./roll-the-dice/client").then((module) => ({
    default: module.DiceScreen,
  })),
);
import { manifest } from "./roll-the-dice/manifest";
export interface ClientGame {
  manifest: {
    id: string;
    name: string;
    description: string;
    minPlayers: number;
    maxPlayers: number;
  };
  Screen: ComponentType<GameScreenProps>;
}
export const clientGames: Record<string, ClientGame> = {
  [manifest.id]: { manifest, Screen: DiceScreen },
};
