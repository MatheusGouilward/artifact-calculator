type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const ttlCache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

export function getCachedValue<T>(key: string): T | undefined {
  const entry = ttlCache.get(key);
  if (!entry) {
    return undefined;
  }

  if (entry.expiresAt <= Date.now()) {
    ttlCache.delete(key);
    return undefined;
  }

  return entry.value as T;
}

export function setCachedValue<T>(key: string, value: T, ttlSeconds: number): void {
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    return;
  }

  const expiresAt = Date.now() + Math.floor(ttlSeconds * 1000);
  ttlCache.set(key, { value, expiresAt });
}

export function getOrCreateInFlight<T>(key: string, create: () => Promise<T>): Promise<T> {
  const active = inFlight.get(key);
  if (active) {
    return active as Promise<T>;
  }

  const next = create().finally(() => {
    inFlight.delete(key);
  });

  inFlight.set(key, next);
  return next;
}

export function resetEnkaCacheForTests(): void {
  ttlCache.clear();
  inFlight.clear();
}
