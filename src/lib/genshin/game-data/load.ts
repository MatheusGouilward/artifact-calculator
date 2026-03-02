import rawGameData from "./generated/game-data-lite.json";

import type { GameDataLite } from "./types";

export function loadGameDataLite(): GameDataLite {
  return rawGameData as GameDataLite;
}
