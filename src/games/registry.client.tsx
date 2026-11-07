import { lazy, type ComponentType } from "react";
import { Dice5, type LucideIcon } from "lucide-react";
import type { GameManifest, GameScreenProps } from "../platform/contracts";
const DiceScreen = lazy(() =>
  import("./roll-the-dice/client").then((module) => ({
    default: module.DiceScreen,
  })),
);
import { manifest } from "./roll-the-dice/manifest";
export interface ClientGame {
  manifest: GameManifest;
  Screen: ComponentType<GameScreenProps>;
  Icon: LucideIcon;
}
export const clientGames: Record<string, ClientGame> = {
  [manifest.id]: { manifest, Screen: DiceScreen, Icon: Dice5 },
};
