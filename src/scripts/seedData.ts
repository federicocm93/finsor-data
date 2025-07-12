import { VectorService } from '../services/vectorService';
import { DataSourceService } from '../services/dataSourceService';
import { CacheService } from '../services/cacheService';
import logger from '../utils/logger';

async function seedInitialData(): Promise<void> {
  const vectorService = new VectorService();
  const dataSourceService = new DataSourceService();
  const cacheService = new CacheService();

  try {
    logger.info('Starting initial data seeding...');

    // Initialize services
    await cacheService.connect();
    await vectorService.initialize();

    logger.info('Services initialized, starting data collection...');

    // Collect initial data from all sources
    const dataPromises = [
      dataSourceService.fetchNews(),
      dataSourceService.fetchCryptoData(),
      dataSourceService.fetchStockData(),
      dataSourceService.fetchTrendsData(),
      dataSourceService.fetchCentralBankRates(),
      dataSourceService.fetchEconomicIndicators(),
    ];

    const results = await Promise.allSettled(dataPromises);
    
    let totalDataPoints = 0;
    
    for (const [index, result] of results.entries()) {
      const sourceNames = ['News', 'Crypto', 'Stocks', 'Trends', 'Rates', 'Economic'];
      
      if (result.status === 'fulfilled') {
        const data = result.value;
        if (data.length > 0) {
          await vectorService.addData(data);
          totalDataPoints += data.length;
          logger.info(`✓ ${sourceNames[index]}: ${data.length} items`);
        } else {
          logger.warn(`⚠ ${sourceNames[index]}: No data retrieved`);
        }
      } else {
        logger.error(`✗ ${sourceNames[index]}: ${result.reason}`);
      }
    }

    // Get final statistics
    const stats = await vectorService.getStats();
    
    logger.info('Data seeding completed successfully!');
    logger.info(`Total documents in vector database: ${stats.totalDocuments}`);
    logger.info(`Data distribution:`, stats.typeDistribution);
    
    process.exit(0);
    
  } catch (error) {
    logger.error('Failed to seed initial data:', error);
    process.exit(1);
  } finally {
    await cacheService.disconnect();
  }
}

// Run the seeding script
if (require.main === module) {
  seedInitialData();
}