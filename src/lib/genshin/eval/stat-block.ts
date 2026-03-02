import { ALL_STAT_KEYS, StatKey } from "./stat-keys";

export type StatBlock = Record<StatKey, number>;

function mapStatBlock(mapper: (key: StatKey) => number): StatBlock {
  const block = {} as StatBlock;
  for (const key of ALL_STAT_KEYS) {
    block[key] = mapper(key);
  }
  return block;
}

export function emptyStatBlock(): StatBlock {
  return mapStatBlock(() => 0);
}

export function addStatBlocks(a: StatBlock, b: StatBlock): StatBlock {
  return mapStatBlock((key) => a[key] + b[key]);
}

export function sumStatBlocks(list: StatBlock[]): StatBlock {
  return mapStatBlock((key) => list.reduce((sum, block) => sum + block[key], 0));
}

export function getStat(block: StatBlock, key: StatKey): number {
  return block[key];
}

export function setStat(block: StatBlock, key: StatKey, value: number): StatBlock {
  return {
    ...block,
    [key]: value,
  } as StatBlock;
}

export function clampCrit(block: StatBlock): StatBlock {
  const critRate = getStat(block, "crit_rate_pct");
  if (critRate < 0) {
    return setStat(block, "crit_rate_pct", 0);
  }
  if (critRate > 100) {
    return setStat(block, "crit_rate_pct", 100);
  }
  return block;
}
