import { createClient, RedisClientType } from 'redis';
import { config } from '../config';
import logger from '../utils/logger';

export class CacheService {
  private client: RedisClientType;
  private isConnected: boolean = false;

  constructor() {
    this.client = createClient({
      url: config.redis.url,
    });

    this.client.on('error', (err) => {
      logger.error('Redis Client Error:', err);
      this.isConnected = false;
    });

    this.client.on('connect', () => {
      logger.info('Redis Client Connected');
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      logger.warn('Redis Client Disconnected');
      this.isConnected = false;
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      logger.info('Cache service initialized');
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.client.disconnect();
      logger.info('Cache service disconnected');
    } catch (error) {
      logger.error('Error disconnecting from Redis:', error);
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.isConnected) {
      logger.warn('Redis not connected, cache miss for key:', key);
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (value) {
        logger.debug(`Cache hit for key: ${key}`);
      } else {
        logger.debug(`Cache miss for key: ${key}`);
      }
      return value;
    } catch (error) {
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    if (!this.isConnected) {
      logger.warn('Redis not connected, cannot cache key:', key);
      return false;
    }

    try {
      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
      
      logger.debug(`Cache set for key: ${key}${ttlSeconds ? ` (TTL: ${ttlSeconds}s)` : ''}`);
      return true;
    } catch (error) {
      logger.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  async del(key: string): Promise<boolean> {
    if (!this.isConnected) {
      logger.warn('Redis not connected, cannot delete key:', key);
      return false;
    }

    try {
      const result = await this.client.del(key);
      logger.debug(`Cache delete for key: ${key}, deleted: ${result > 0}`);
      return result > 0;
    } catch (error) {
      logger.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    if (!this.isConnected) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result > 0;
    } catch (error) {
      logger.error(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  async keys(pattern: string): Promise<string[]> {
    if (!this.isConnected) {
      return [];
    }

    try {
      return await this.client.keys(pattern);
    } catch (error) {
      logger.error(`Cache keys error for pattern ${pattern}:`, error);
      return [];
    }
  }

  async flushPattern(pattern: string): Promise<number> {
    if (!this.isConnected) {
      return 0;
    }

    try {
      const keys = await this.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }

      const result = await this.client.del(keys);
      logger.info(`Flushed ${result} keys matching pattern: ${pattern}`);
      return result;
    } catch (error) {
      logger.error(`Cache flush error for pattern ${pattern}:`, error);
      return 0;
    }
  }

  async getStats(): Promise<{
    isConnected: boolean;
    memoryUsage?: string;
    totalKeys?: number;
    uptime?: number;
  }> {
    const stats = {
      isConnected: this.isConnected,
    };

    if (!this.isConnected) {
      return stats;
    }

    try {
      const info = await this.client.info();
      const lines = info.split('\r\n');
      
      const memoryLine = lines.find(line => line.startsWith('used_memory_human:'));
      if (memoryLine) {
        (stats as any).memoryUsage = memoryLine.split(':')[1];
      }

      const dbSize = await this.client.dbSize();
      (stats as any).totalKeys = dbSize;

      const uptimeLine = lines.find(line => line.startsWith('uptime_in_seconds:'));
      if (uptimeLine) {
        (stats as any).uptime = parseInt(uptimeLine.split(':')[1]);
      }

      return stats;
    } catch (error) {
      logger.error('Error getting cache stats:', error);
      return stats;
    }
  }

  // Utility methods for common caching patterns
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttlSeconds?: number,
    serializer: {
      serialize: (data: T) => string;
      deserialize: (data: string) => T;
    } = {
      serialize: JSON.stringify,
      deserialize: JSON.parse,
    }
  ): Promise<T> {
    const cached = await this.get(key);
    
    if (cached) {
      try {
        return serializer.deserialize(cached);
      } catch (error) {
        logger.warn(`Failed to deserialize cached data for key ${key}:`, error);
        await this.del(key);
      }
    }

    const freshData = await fetcher();
    const serialized = serializer.serialize(freshData);
    await this.set(key, serialized, ttlSeconds);
    
    return freshData;
  }
}