import cron from 'node-cron';
import { DataSourceService } from './dataSourceService';
import { VectorService } from './vectorService';
import { CacheService } from './cacheService';
import { config } from '../config';
import logger from '../utils/logger';

export class SchedulerService {
  private dataSourceService: DataSourceService;
  private vectorService: VectorService;
  private cacheService: CacheService;
  private scheduledTasks: Map<string, cron.ScheduledTask> = new Map();

  constructor(
    dataSourceService: DataSourceService,
    vectorService: VectorService,
    cacheService: CacheService
  ) {
    this.dataSourceService = dataSourceService;
    this.vectorService = vectorService;
    this.cacheService = cacheService;
  }

  start(): void {
    logger.info('Starting data ingestion scheduler');

    // News ingestion - every 15 minutes
    this.scheduleTask('news', config.schedules.news, async () => {
      await this.ingestNews();
    });

    // Crypto data - every 5 minutes
    this.scheduleTask('crypto', config.schedules.crypto, async () => {
      await this.ingestCrypto();
    });

    // Stock data - every 10 minutes (during market hours)
    this.scheduleTask('stocks', config.schedules.stocks, async () => {
      if (this.isMarketHours()) {
        await this.ingestStocks();
      }
    });

    // Google Trends - every 6 hours
    this.scheduleTask('trends', config.schedules.trends, async () => {
      await this.ingestTrends();
    });

    // Central bank rates - weekly on Monday
    this.scheduleTask('rates', config.schedules.rates, async () => {
      await this.ingestRates();
    });

    // Economic indicators - weekly on Monday
    this.scheduleTask('economic', config.schedules.economic, async () => {
      await this.ingestEconomicData();
    });

    logger.info('All scheduled tasks started');
  }

  stop(): void {
    logger.info('Stopping data ingestion scheduler');
    
    for (const [name, task] of this.scheduledTasks) {
      (task as any).destroy();
      logger.info(`Stopped task: ${name}`);
    }
    
    this.scheduledTasks.clear();
  }

  async runOnce(taskType: string): Promise<void> {
    logger.info(`Running one-time ingestion for: ${taskType}`);
    
    switch (taskType) {
      case 'news':
        await this.ingestNews();
        break;
      case 'crypto':
        await this.ingestCrypto();
        break;
      case 'stocks':
        await this.ingestStocks();
        break;
      case 'trends':
        await this.ingestTrends();
        break;
      case 'rates':
        await this.ingestRates();
        break;
      case 'economic':
        await this.ingestEconomicData();
        break;
      case 'all':
        await this.ingestAll();
        break;
      default:
        throw new Error(`Unknown task type: ${taskType}`);
    }
  }

  private scheduleTask(name: string, cronExpression: string, task: () => Promise<void>): void {
    const scheduledTask = cron.schedule(cronExpression, async () => {
      const startTime = Date.now();
      logger.info(`Starting scheduled task: ${name}`);
      
      try {
        await task();
        const duration = Date.now() - startTime;
        logger.info(`Completed task ${name} in ${duration}ms`);
      } catch (error) {
        logger.error(`Failed to execute task ${name}:`, error);
      }
    }, {
      scheduled: false,
    });

    this.scheduledTasks.set(name, scheduledTask);
    scheduledTask.start();
    
    logger.info(`Scheduled task: ${name} with cron: ${cronExpression}`);
  }

  private async ingestNews(): Promise<void> {
    try {
      const cacheKey = 'news_latest';
      const cached = await this.cacheService.get(cacheKey);
      
      if (cached) {
        logger.debug('News data found in cache, skipping fetch');
        return;
      }

      const newsData = await this.dataSourceService.fetchNews();
      
      if (newsData.length > 0) {
        await this.vectorService.addData(newsData);
        await this.cacheService.set(cacheKey, 'fetched', config.cache.ttl.news);
        logger.info(`Ingested ${newsData.length} news items`);
      }
    } catch (error) {
      logger.error('News ingestion failed:', error);
    }
  }

  private async ingestCrypto(): Promise<void> {
    try {
      const cacheKey = 'crypto_latest';
      const cached = await this.cacheService.get(cacheKey);
      
      if (cached) {
        logger.debug('Crypto data found in cache, skipping fetch');
        return;
      }

      const cryptoData = await this.dataSourceService.fetchCryptoData();
      
      if (cryptoData.length > 0) {
        await this.vectorService.addData(cryptoData);
        await this.cacheService.set(cacheKey, 'fetched', config.cache.ttl.crypto);
        logger.info(`Ingested ${cryptoData.length} crypto data points`);
      }
    } catch (error) {
      logger.error('Crypto ingestion failed:', error);
    }
  }

  private async ingestStocks(): Promise<void> {
    try {
      const cacheKey = 'stocks_latest';
      const cached = await this.cacheService.get(cacheKey);
      
      if (cached) {
        logger.debug('Stock data found in cache, skipping fetch');
        return;
      }

      const stockData = await this.dataSourceService.fetchStockData();
      
      if (stockData.length > 0) {
        await this.vectorService.addData(stockData);
        await this.cacheService.set(cacheKey, 'fetched', config.cache.ttl.stocks);
        logger.info(`Ingested ${stockData.length} stock data points`);
      }
    } catch (error) {
      logger.error('Stock ingestion failed:', error);
    }
  }

  private async ingestTrends(): Promise<void> {
    try {
      const cacheKey = 'trends_latest';
      const cached = await this.cacheService.get(cacheKey);
      
      if (cached) {
        logger.debug('Trends data found in cache, skipping fetch');
        return;
      }

      const trendsData = await this.dataSourceService.fetchTrendsData();
      
      if (trendsData.length > 0) {
        await this.vectorService.addData(trendsData);
        await this.cacheService.set(cacheKey, 'fetched', config.cache.ttl.trends);
        logger.info(`Ingested ${trendsData.length} trends data points`);
      }
    } catch (error) {
      logger.error('Trends ingestion failed:', error);
    }
  }

  private async ingestRates(): Promise<void> {
    try {
      const cacheKey = 'rates_latest';
      const cached = await this.cacheService.get(cacheKey);
      
      if (cached) {
        logger.debug('Rates data found in cache, skipping fetch');
        return;
      }

      const ratesData = await this.dataSourceService.fetchCentralBankRates();
      
      if (ratesData.length > 0) {
        await this.vectorService.addData(ratesData);
        await this.cacheService.set(cacheKey, 'fetched', config.cache.ttl.rates);
        logger.info(`Ingested ${ratesData.length} central bank rates`);
      }
    } catch (error) {
      logger.error('Rates ingestion failed:', error);
    }
  }

  private async ingestEconomicData(): Promise<void> {
    try {
      const cacheKey = 'economic_latest';
      const cached = await this.cacheService.get(cacheKey);
      
      if (cached) {
        logger.debug('Economic data found in cache, skipping fetch');
        return;
      }

      const economicData = await this.dataSourceService.fetchEconomicIndicators();
      
      if (economicData.length > 0) {
        await this.vectorService.addData(economicData);
        await this.cacheService.set(cacheKey, 'fetched', config.cache.ttl.economic);
        logger.info(`Ingested ${economicData.length} economic indicators`);
      }
    } catch (error) {
      logger.error('Economic data ingestion failed:', error);
    }
  }

  private async ingestAll(): Promise<void> {
    logger.info('Running full data ingestion');
    
    await Promise.allSettled([
      this.ingestNews(),
      this.ingestCrypto(),
      this.ingestStocks(),
      this.ingestTrends(),
      this.ingestRates(),
      this.ingestEconomicData(),
    ]);
    
    logger.info('Full data ingestion completed');
  }

  private isMarketHours(): boolean {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday, 6 = Saturday
    const hour = now.getHours();
    
    // Only run during US market hours (Monday-Friday, 9:30 AM - 4:00 PM EST)
    // This is a simplified check - in production, you'd want to account for holidays and timezone
    if (day === 0 || day === 6) {
      return false; // Weekend
    }
    
    if (hour < 9 || hour >= 16) {
      return false; // Outside market hours
    }
    
    return true;
  }

  getScheduledTasks(): Array<{ name: string; isRunning: boolean; nextExecution?: Date }> {
    const tasks: Array<{ name: string; isRunning: boolean; nextExecution?: Date }> = [];
    
    for (const [name, task] of this.scheduledTasks) {
      tasks.push({
        name,
        isRunning: (task as any).getStatus() === 'scheduled',
        // nextExecution would need additional tracking to implement accurately
      });
    }
    
    return tasks;
  }
}