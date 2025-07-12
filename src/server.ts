import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import { VectorService } from './services/vectorService';
import { DataSourceService } from './services/dataSourceService';
import { SchedulerService } from './services/schedulerService';
import { CacheService } from './services/cacheService';
import { DataController } from './controllers/dataController';
import { createRoutes } from './routes';
import { config } from './config';
import logger from './utils/logger';

class DataServiceApp {
  private app: express.Application;
  private vectorService!: VectorService;
  private dataSourceService!: DataSourceService;
  private schedulerService!: SchedulerService;
  private cacheService!: CacheService;
  private dataController!: DataController;

  constructor() {
    this.app = express();
    this.initializeServices();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  private initializeServices(): void {
    this.vectorService = new VectorService();
    this.dataSourceService = new DataSourceService();
    this.cacheService = new CacheService();
    
    this.schedulerService = new SchedulerService(
      this.dataSourceService,
      this.vectorService,
      this.cacheService
    );
    
    this.dataController = new DataController(
      this.vectorService,
      this.schedulerService,
      this.cacheService
    );
  }

  private setupMiddleware(): void {
    // Security
    this.app.use(helmet());
    
    // CORS
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production' 
        ? ['http://localhost:3000', 'http://localhost:3001'] 
        : true,
      credentials: true,
    }));

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Logging
    if (config.nodeEnv !== 'test') {
      this.app.use(morgan('combined', {
        stream: {
          write: (message: string) => {
            logger.info(message.trim());
          }
        }
      }));
    }

    // Request ID middleware
    this.app.use((req, res, next) => {
      req.id = Math.random().toString(36).substr(2, 9);
      res.setHeader('X-Request-ID', req.id);
      next();
    });
  }

  private setupRoutes(): void {
    // API routes
    this.app.use('/api', createRoutes(this.dataController));

    // Root health check
    this.app.get('/', (req, res) => {
      res.json({
        service: 'Finsor Data Service',
        version: '1.0.0',
        status: 'running',
        timestamp: new Date().toISOString(),
        endpoints: {
          health: '/health',
          query: 'POST /api/query',
          recent: 'GET /api/recent',
          symbol: 'GET /api/symbol/:symbol',
          stats: 'GET /api/stats',
          ingest: 'POST /api/ingest',
          clearCache: 'POST /api/cache/clear',
        }
      });
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString(),
      });
    });
  }

  private setupErrorHandling(): void {
    // Global error handler
    this.app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      logger.error('Unhandled error:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        body: req.body,
        query: req.query,
        headers: req.headers,
      });

      const isDev = config.nodeEnv === 'development';
      
      res.status(500).json({
        error: 'Internal server error',
        message: isDev ? err.message : 'Something went wrong',
        stack: isDev ? err.stack : undefined,
        timestamp: new Date().toISOString(),
        requestId: req.id,
      });
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGTERM', this.gracefulShutdown.bind(this));
    process.on('SIGINT', this.gracefulShutdown.bind(this));
  }

  async start(): Promise<void> {
    try {
      // Initialize services
      await this.cacheService.connect();
      await this.vectorService.initialize();

      // Start the scheduler
      this.schedulerService.start();

      // Start server
      const server = this.app.listen(config.port, () => {
        logger.info(`Data service running on port ${config.port}`);
        logger.info(`Environment: ${config.nodeEnv}`);
        logger.info(`Vector DB: ${config.chroma.host}:${config.chroma.port}`);
        logger.info(`Redis: ${config.redis.url}`);
      });

      // Store server reference for graceful shutdown
      (this as any).server = server;

      // Log successful startup
      logger.info('Finsor Data Service started successfully');

    } catch (error) {
      logger.error('Failed to start data service:', error);
      process.exit(1);
    }
  }

  private async gracefulShutdown(signal: string): Promise<void> {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    try {
      // Stop accepting new requests
      if ((this as any).server) {
        (this as any).server.close(() => {
          logger.info('HTTP server closed');
        });
      }

      // Stop scheduler
      this.schedulerService.stop();

      // Disconnect from services
      await this.cacheService.disconnect();

      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  }
}

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

// Start the application
if (require.main === module) {
  const app = new DataServiceApp();
  app.start();
}

export default DataServiceApp;