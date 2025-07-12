import { Router } from 'express';
import { DataController } from '../controllers/dataController';
import { rateLimitMiddleware } from '../middleware/rateLimiter';

export function createRoutes(dataController: DataController): Router {
  const router = Router();

  // Apply rate limiting to all routes
  router.use(rateLimitMiddleware);

  // Health check (no rate limiting needed)
  router.get('/health', dataController.healthCheck.bind(dataController));

  // Query endpoints
  router.post('/query', dataController.query.bind(dataController));
  router.get('/recent', dataController.getRecentData.bind(dataController));
  router.get('/symbol/:symbol', dataController.searchBySymbol.bind(dataController));

  // Statistics and monitoring
  router.get('/stats', dataController.getStats.bind(dataController));

  // Administrative endpoints
  router.post('/ingest', dataController.triggerIngestion.bind(dataController));
  router.post('/cache/clear', dataController.clearCache.bind(dataController));

  return router;
}