import rawGameDataCore from "./generated/game-data-core.json";

import type { GameDataCore } from "./types";
import { validateGameDataCore } from "./validate";

let cachedGameDataCore: GameDataCore | null = null;

export function loadGameDataCore(): GameDataCore {
  if (cachedGameDataCore) {
    return cachedGameDataCore;
  }
  cachedGameDataCore = validateGameDataCore(rawGameDataCore);
  return cachedGameDataCore;
}

export function resetGameDataCoreCacheForTests(): void {
  cachedGameDataCore = null;
}
