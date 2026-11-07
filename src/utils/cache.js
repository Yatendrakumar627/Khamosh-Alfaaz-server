/**
 * High-performance In-Memory Cache for fast server response times.
 * Prevents redundant database lookups for public feeds, quotes, and categories.
 */

class ServerCache {
  constructor(defaultTtlSeconds = 60) {
    this.defaultTtl = defaultTtlSeconds * 1000;
    this.cache = new Map();
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      return null;
    }
    return item.value;
  }

  set(key, value, ttlSeconds) {
    const ttl = (ttlSeconds !== undefined ? ttlSeconds : this.defaultTtl / 1000) * 1000;
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl,
    });
  }

  invalidate(key) {
    this.cache.delete(key);
  }

  invalidatePrefix(prefix) {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }

  clear() {
    this.cache.clear();
  }
}

export const cache = new ServerCache(60);
export default cache;

