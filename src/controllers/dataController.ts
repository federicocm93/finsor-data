import { Request, Response } from 'express';
import { VectorService } from '../services/vectorService';
import { SchedulerService } from '../services/schedulerService';
import { CacheService } from '../services/cacheService';
import { QueryRequest, QueryResponse } from '../types';
import logger from '../utils/logger';

export class DataController {
  private vectorService: VectorService;
  private schedulerService: SchedulerService;
  private cacheService: CacheService;

  constructor(
    vectorService: VectorService,
    schedulerService: SchedulerService,
    cacheService: CacheService
  ) {
    this.vectorService = vectorService;
    this.schedulerService = schedulerService;
    this.cacheService = cacheService;
  }

  async query(req: Request, res: Response): Promise<void> {
    const startTime = Date.now();
    
    try {
      const { query, type, limit = 10, timeRange, symbols }: QueryRequest = req.body;

      if (!query || typeof query !== 'string') {
        res.status(400).json({
          error: 'Query parameter is required and must be a string',
        });
        return;
      }

      // Check cache first
      const cacheKey = `query:${JSON.stringify({ query, type, limit, timeRange, symbols })}`;
      const cached = await this.cacheService.get(cacheKey);
      
      if (cached) {
        const cachedResult = JSON.parse(cached);
        res.json({
          ...cachedResult,
          cached: true,
          processingTime: Date.now() - startTime,
        });
        return;
      }

      // Parse time range if provided
      let parsedTimeRange;
      if (timeRange) {
        parsedTimeRange = {
          start: new Date(timeRange.start),
          end: new Date(timeRange.end),
        };
      }

      const { results, references } = await this.vectorService.query(query, {
        type,
        limit,
        timeRange: parsedTimeRange,
        symbols,
      });

      const response: QueryResponse = {
        results,
        total: results.length,
        query,
        processingTime: Date.now() - startTime,
        references,
      };

      // Cache the results for 5 minutes
      await this.cacheService.set(cacheKey, JSON.stringify(response), 300);

      res.json(response);
      
      logger.info(`Query processed: "${query}" returned ${results.length} results in ${response.processingTime}ms`);
    } catch (error) {
      logger.error('Query failed:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getStats(req: Request, res: Response): Promise<void> {
    try {
      const [vectorStats, cacheStats, scheduledTasks] = await Promise.all([
        this.vectorService.getStats(),
        this.cacheService.getStats(),
        Promise.resolve(this.schedulerService.getScheduledTasks()),
      ]);

      res.json({
        vector: vectorStats,
        cache: cacheStats,
        scheduler: {
          tasks: scheduledTasks,
          totalTasks: scheduledTasks.length,
          runningTasks: scheduledTasks.filter(t => t.isRunning).length,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to get stats:', error);
      res.status(500).json({
        error: 'Failed to retrieve statistics',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async triggerIngestion(req: Request, res: Response): Promise<void> {
    try {
      const { type = 'all' } = req.body;

      if (!['news', 'crypto', 'stocks', 'trends', 'rates', 'economic', 'all'].includes(type)) {
        res.status(400).json({
          error: 'Invalid ingestion type',
          validTypes: ['news', 'crypto', 'stocks', 'trends', 'rates', 'economic', 'all'],
        });
        return;
      }

      // Run ingestion in background
      this.schedulerService.runOnce(type).catch(error => {
        logger.error(`Background ingestion failed for type ${type}:`, error);
      });

      res.json({
        message: `${type} ingestion triggered`,
        type,
        timestamp: new Date().toISOString(),
      });

      logger.info(`Manual ingestion triggered for type: ${type}`);
    } catch (error) {
      logger.error('Failed to trigger ingestion:', error);
      res.status(500).json({
        error: 'Failed to trigger ingestion',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async getRecentData(req: Request, res: Response): Promise<void> {
    try {
      const { type, limit = 50 } = req.query;
      
      const timeRange = {
        start: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
        end: new Date(),
      };

      const { results, references } = await this.vectorService.query('', {
        type: type ? [type as string] : undefined,
        limit: parseInt(limit as string),
        timeRange,
      });

      res.json({
        results,
        total: results.length,
        timeRange,
        type: type || 'all',
        references,
      });
    } catch (error) {
      logger.error('Failed to get recent data:', error);
      res.status(500).json({
        error: 'Failed to retrieve recent data',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async searchBySymbol(req: Request, res: Response): Promise<void> {
    try {
      const { symbol } = req.params;
      const { limit = 20, type } = req.query;

      if (!symbol) {
        res.status(400).json({
          error: 'Symbol parameter is required',
        });
        return;
      }

      const { results, references } = await this.vectorService.query(symbol.toUpperCase(), {
        symbols: [symbol.toUpperCase()],
        type: type ? [type as string] : undefined,
        limit: parseInt(limit as string),
      });

      res.json({
        results,
        total: results.length,
        symbol: symbol.toUpperCase(),
        type: type || 'all',
        references,
      });
    } catch (error) {
      logger.error('Failed to search by symbol:', error);
      res.status(500).json({
        error: 'Failed to search by symbol',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async clearCache(req: Request, res: Response): Promise<void> {
    try {
      const { pattern = '*' } = req.body;
      
      const deletedCount = await this.cacheService.flushPattern(pattern);
      
      res.json({
        message: 'Cache cleared successfully',
        deletedKeys: deletedCount,
        pattern,
        timestamp: new Date().toISOString(),
      });

      logger.info(`Cache cleared: ${deletedCount} keys deleted with pattern "${pattern}"`);
    } catch (error) {
      logger.error('Failed to clear cache:', error);
      res.status(500).json({
        error: 'Failed to clear cache',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const [vectorStats, cacheStats] = await Promise.allSettled([
        this.vectorService.getStats(),
        this.cacheService.getStats(),
      ]);

      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
          vector: vectorStats.status === 'fulfilled' ? 'healthy' : 'unhealthy',
          cache: cacheStats.status === 'fulfilled' && 
                 cacheStats.status === 'fulfilled' && 
                 (cacheStats.value as any).isConnected ? 'healthy' : 'unhealthy',
        },
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      };

      const isHealthy = Object.values(health.services).every(status => status === 'healthy');
      
      res.status(isHealthy ? 200 : 503).json(health);
    } catch (error) {
      logger.error('Health check failed:', error);
      res.status(503).json({
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      });
    }
  }
}