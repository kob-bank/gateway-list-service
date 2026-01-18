import Redis from 'ioredis';
import { config } from '../config';

export class CacheService {
  private redis: Redis;

  constructor() {
    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    this.redis.on('connect', () => {
      console.log('[Cache] Connected to Redis');
    });

    this.redis.on('error', (err) => {
      console.error('[Cache] Redis error:', err);
    });
  }

  /**
   * Get primary cache key for a site
   */
  private getPrimaryKey(site: string): string {
    return `gateway-list:${site}:primary`;
  }

  /**
   * Get stale cache key for a site
   */
  private getStaleKey(site: string): string {
    return `gateway-list:${site}:stale`;
  }

  /**
   * Get gateway list from cache
   * Tries primary cache first, falls back to stale cache
   */
  async get(site: string): Promise<any | null> {
    try {
      // Try primary cache first
      const primary = await this.redis.get(this.getPrimaryKey(site));
      if (primary) {
        console.log(`[Cache] Hit primary cache for site: ${site}`);
        return JSON.parse(primary);
      }

      // Fallback to stale cache
      const stale = await this.redis.get(this.getStaleKey(site));
      if (stale) {
        console.log(`[Cache] Hit stale cache for site: ${site}`);
        return JSON.parse(stale);
      }

      console.log(`[Cache] Miss for site: ${site}`);
      return null;
    } catch (error) {
      console.error(`[Cache] Error getting cache for site ${site}:`, error);
      return null;
    }
  }

  /**
   * Set gateway list in both primary and stale caches
   */
  async set(site: string, data: any): Promise<void> {
    try {
      const serialized = JSON.stringify(data);

      // Set primary cache with short TTL
      await this.redis.setex(
        this.getPrimaryKey(site),
        config.cache.primaryTtl,
        serialized
      );

      // Set stale cache with long TTL
      await this.redis.setex(
        this.getStaleKey(site),
        config.cache.staleTtl,
        serialized
      );

      console.log(`[Cache] Updated cache for site: ${site}`);
    } catch (error) {
      console.error(`[Cache] Error setting cache for site ${site}:`, error);
      throw error;
    }
  }

  /**
   * Get last update timestamp for a site
   */
  async getLastUpdate(site: string): Promise<Date | null> {
    try {
      const key = `gateway-list:${site}:last-update`;
      const timestamp = await this.redis.get(key);
      return timestamp ? new Date(parseInt(timestamp)) : null;
    } catch (error) {
      console.error(`[Cache] Error getting last update for site ${site}:`, error);
      return null;
    }
  }

  /**
   * Set last update timestamp for a site
   */
  async setLastUpdate(site: string): Promise<void> {
    try {
      const key = `gateway-list:${site}:last-update`;
      await this.redis.set(key, Date.now().toString());
    } catch (error) {
      console.error(`[Cache] Error setting last update for site ${site}:`, error);
    }
  }

  /**
   * Health check - verify Redis connection
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.redis.ping();
      return true;
    } catch (error) {
      console.error('[Cache] Health check failed:', error);
      return false;
    }
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}
