export function popcount(mask: number): number {
  let value = mask >>> 0;
  let count = 0;
  while (value !== 0) {
    value &= value - 1;
    count += 1;
  }
  return count;
}

export function dpWeightedDrawMasks(weights: number[], k: number): Map<number, number> {
  if (!Number.isInteger(k) || k < 0) {
    throw new RangeError(`k must be a non-negative integer, received: ${k}`);
  }

  const n = weights.length;
  if (k > n) {
    return new Map();
  }

  for (const weight of weights) {
    if (!Number.isFinite(weight) || weight < 0) {
      throw new RangeError(`All weights must be finite and >= 0, received: ${weight}`);
    }
  }

  const maxMask = 1 << n;
  const totalWeight = weights.reduce((acc, value) => acc + value, 0);
  const sumW = new Float64Array(maxMask);
  const maskPopcount = new Uint8Array(maxMask);

  for (let mask = 1; mask < maxMask; mask += 1) {
    const leastBit = mask & -mask;
    const previous = mask ^ leastBit;
    const index = 31 - Math.clz32(leastBit);
    sumW[mask] = sumW[previous] + weights[index];
    maskPopcount[mask] = maskPopcount[previous] + 1;
  }

  let dp = new Float64Array(maxMask);
  let next = new Float64Array(maxMask);
  dp[0] = 1;

  for (let step = 0; step < k; step += 1) {
    next.fill(0);

    for (let mask = 0; mask < maxMask; mask += 1) {
      if (maskPopcount[mask] !== step) {
        continue;
      }

      const probability = dp[mask];
      if (probability === 0) {
        continue;
      }

      const remainingWeight = totalWeight - sumW[mask];
      if (remainingWeight <= 0) {
        continue;
      }

      for (let index = 0; index < n; index += 1) {
        const bit = 1 << index;
        if ((mask & bit) !== 0) {
          continue;
        }

        const weight = weights[index];
        if (weight <= 0) {
          continue;
        }

        const nextMask = mask | bit;
        next[nextMask] += probability * (weight / remainingWeight);
      }
    }

    [dp, next] = [next, dp];
  }

  const output = new Map<number, number>();
  for (let mask = 0; mask < maxMask; mask += 1) {
    if (maskPopcount[mask] !== k) {
      continue;
    }

    const probability = dp[mask];
    if (probability > 0) {
      output.set(mask, probability);
    }
  }

  return output;
}
