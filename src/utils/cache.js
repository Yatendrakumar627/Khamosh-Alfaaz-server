/**
 * High-performance In-Memory Cache for fast server response times.
 * Prevents redundant database lookups for public feeds, quotes, and categories.
 */

class ServerCache {
  constructor(defaultTtlSeconds = 60, maxEntries = 500) {
    this.defaultTtl = defaultTtlSeconds * 1000;
    this.maxEntries = maxEntries;
    this.cache = new Map();

    // Active background sweep every 60s to prevent stale memory accumulation
    this.sweepInterval = setInterval(() => this.purgeExpired(), 60000);
    if (this.sweepInterval.unref) {
      this.sweepInterval.unref();
    }
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
    if (!this.cache.has(key) && this.cache.size >= this.maxEntries) {
      // FIFO eviction of the oldest inserted key to enforce strict memory bounds
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    const ttl = (ttlSeconds !== undefined ? ttlSeconds : this.defaultTtl / 1000) * 1000;
    this.cache.set(key, {
      value,
      expiry: Date.now() + ttl,
    });
  }

  purgeExpired() {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
      }
    }
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

  destroy() {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
    }
    this.clear();
  }
}

export const cache = new ServerCache(60, 500);
export default cache;

