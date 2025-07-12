import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import logger from '../utils/logger';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

export class RateLimiter {
  private store: RateLimitStore = {};
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number = config.rateLimit.windowMs, maxRequests: number = config.rateLimit.maxRequests) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    
    // Clean up expired entries every minute
    setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  middleware = (req: Request, res: Response, next: NextFunction): void => {
    const key = this.getKey(req);
    const now = Date.now();
    
    // Get or create entry
    if (!this.store[key]) {
      this.store[key] = {
        count: 0,
        resetTime: now + this.windowMs,
      };
    }
    
    const entry = this.store[key];
    
    // Reset if window expired
    if (now >= entry.resetTime) {
      entry.count = 0;
      entry.resetTime = now + this.windowMs;
    }
    
    // Check limit
    if (entry.count >= this.maxRequests) {
      const resetIn = Math.ceil((entry.resetTime - now) / 1000);
      
      res.status(429).json({
        error: 'Too many requests',
        message: `Rate limit exceeded. Try again in ${resetIn} seconds.`,
        retryAfter: resetIn,
        limit: this.maxRequests,
        windowMs: this.windowMs,
      });
      
      logger.warn(`Rate limit exceeded for ${key}: ${entry.count}/${this.maxRequests} requests`);
      return;
    }
    
    // Increment counter
    entry.count++;
    
    // Add headers
    res.set({
      'X-RateLimit-Limit': this.maxRequests.toString(),
      'X-RateLimit-Remaining': (this.maxRequests - entry.count).toString(),
      'X-RateLimit-Reset': new Date(entry.resetTime).toISOString(),
    });
    
    next();
  };

  private getKey(req: Request): string {
    // Use IP address as the key, but could be enhanced with user ID, API key, etc.
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';
    
    // Simple key generation - in production you might want something more sophisticated
    return `${ip}:${userAgent.slice(0, 50)}`;
  }

  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of Object.entries(this.store)) {
      if (now >= entry.resetTime && entry.count === 0) {
        delete this.store[key];
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      logger.debug(`Rate limiter cleaned up ${cleaned} expired entries`);
    }
  }

  getStats(): {
    totalKeys: number;
    windowMs: number;
    maxRequests: number;
    activeEntries: number;
  } {
    const now = Date.now();
    const activeEntries = Object.values(this.store).filter(
      entry => now < entry.resetTime
    ).length;

    return {
      totalKeys: Object.keys(this.store).length,
      windowMs: this.windowMs,
      maxRequests: this.maxRequests,
      activeEntries,
    };
  }

  reset(): void {
    this.store = {};
    logger.info('Rate limiter store reset');
  }
}

// Create singleton instance
export const rateLimiter = new RateLimiter();

// Export middleware function for easy use
export const rateLimitMiddleware = rateLimiter.middleware;