import { lazy, type ComponentType } from "react";
import { Hand, Dice5, type LucideIcon } from "lucide-react";
import type { GameManifest, GameScreenProps } from "../platform/contracts";
const DiceScreen = lazy(() =>
  import("./roll-the-dice/client").then((module) => ({
    default: module.DiceScreen,
  })),
);
const UndercoverScreen = lazy(() =>
  import("./undercover/client").then((module) => ({
    default: module.UndercoverScreen,
  })),
);
const FastestScreen = lazy(() =>
  import("./fastest-finger-first/client").then((module) => ({
    default: module.FastestScreen,
  })),
);
import { manifest as fastest } from "./fastest-finger-first/manifest";
import { manifest } from "./roll-the-dice/manifest";
import { manifest as undercover } from "./undercover/manifest";
import { Chameleon } from "./undercover/icon";
export interface ClientGame {
  manifest: GameManifest;
  Screen: ComponentType<GameScreenProps>;
  Icon: LucideIcon;
  thumbnail: string;
}
export const clientGames: Record<string, ClientGame> = {
  [fastest.id]: {
    manifest: fastest,
    Screen: FastestScreen,
    Icon: Hand,
    thumbnail: "/thumbnails/fastest-finger-first.jpg",
  },
  [manifest.id]: {
    manifest,
    Screen: DiceScreen,
    Icon: Dice5,
    thumbnail: "/thumbnails/roll-the-dice.jpg",
  },
  [undercover.id]: {
    manifest: undercover,
    Screen: UndercoverScreen,
    Icon: Chameleon,
    thumbnail: "/thumbnails/undercover.jpg",
  },
};
