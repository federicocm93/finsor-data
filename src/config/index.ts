import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3002'),
  nodeEnv: process.env.NODE_ENV || 'development',
  
  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
    model: 'text-embedding-ada-002',
    maxTokens: 8191,
  },
  
  chroma: {
    host: process.env.CHROMA_HOST || 'localhost',
    port: parseInt(process.env.CHROMA_PORT || '8000'),
    collectionName: process.env.CHROMA_COLLECTION_NAME || 'finsor_data',
  },
  
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  
  dataSources: {
    alphaVantage: {
      apiKey: process.env.ALPHA_VANTAGE_API_KEY || '',
      baseUrl: 'https://www.alphavantage.co/query',
    },
    newsApi: {
      apiKey: process.env.NEWS_API_KEY || '',
      baseUrl: 'https://newsapi.org/v2',
    },
    fred: {
      apiKey: process.env.FRED_API_KEY || '',
      baseUrl: 'https://api.stlouisfed.org/fred',
    },
    coinGecko: {
      baseUrl: 'https://api.coingecko.com/api/v3',
    },
  },
  
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000'),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
  
  ingestion: {
    batchSize: 50,
    maxRetries: 3,
    retryDelay: 5000,
  },
  
  schedules: {
    news: '*/15 * * * *',        // Every 15 minutes
    crypto: '*/5 * * * *',       // Every 5 minutes
    stocks: '*/10 * * * *',      // Every 10 minutes
    trends: '0 */6 * * *',       // Every 6 hours
    rates: '0 9 * * 1',          // Every Monday at 9 AM
    economic: '0 10 * * 1',      // Every Monday at 10 AM
  },
  
  cache: {
    ttl: {
      news: 900,        // 15 minutes
      crypto: 300,      // 5 minutes
      stocks: 600,      // 10 minutes
      trends: 21600,    // 6 hours
      rates: 604800,    // 1 week
      economic: 604800, // 1 week
    },
  },
};