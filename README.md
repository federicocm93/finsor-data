# Finsor Data Service

A high-performance data ingestion and vector search service for the Finsor financial advisor application. This service collects, processes, and stores financial data from multiple sources, making it available for AI-powered financial analysis.

## Features

- **Multi-source Data Ingestion**: News, cryptocurrency, stocks, Google trends, central bank rates, and economic indicators
- **Vector Database Storage**: ChromaDB with OpenAI embeddings for semantic search
- **Intelligent Scheduling**: Different frequencies for different data types based on update patterns
- **Redis Caching**: Performance optimization with configurable TTL
- **RESTful API**: Query interface for the main application
- **Real-time Monitoring**: Health checks and statistics endpoints
- **Rate Limiting**: Built-in protection against abuse
- **Graceful Shutdown**: Proper cleanup and connection management

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Data Sources  │    │  Data Service   │    │   Main API      │
│                 │    │                 │    │                 │
│ • News Feeds    │───▶│ • Scheduler     │◀───│ • OpenAI        │
│ • CoinGecko     │    │ • Vector DB     │    │ • Controllers   │
│ • Alpha Vantage │    │ • Cache         │    │ • Routes        │
│ • Google Trends │    │ • API           │    │                 │
│ • FRED API      │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                       ┌─────────────────┐
                       │   ChromaDB      │
                       │   Redis Cache   │
                       └─────────────────┘
```

## Data Sources & Frequencies

| Source | Type | Frequency | Reason |
|--------|------|-----------|---------|
| Financial News | RSS Feeds | 15 min | Breaking news affects markets quickly |
| Cryptocurrency | CoinGecko API | 5 min | High volatility requires frequent updates |
| Stock Prices | Alpha Vantage | 10 min | During market hours only |
| Google Trends | Google Trends API | 6 hours | Search trends change gradually |
| Central Bank Rates | FRED API | Weekly | Rates change infrequently |
| Economic Indicators | FRED API | Weekly | Data released on schedule |

## Setup

### Prerequisites

- Node.js 18+
- ChromaDB running on localhost:8000
- Redis running on localhost:6379
- API keys for data sources

### 1. Install Dependencies

```bash
cd data-service
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Required variables:
- `OPENAI_API_KEY`: For embeddings generation
- `ALPHA_VANTAGE_API_KEY`: For stock data (optional)
- `NEWS_API_KEY`: For additional news sources (optional)
- `FRED_API_KEY`: For economic data (optional)

### 3. Start ChromaDB

```bash
# Using Docker
docker run -p 8000:8000 chromadb/chroma:latest

# Or install locally and run
pip install chromadb
chroma run --host localhost --port 8000
```

### 4. Start Redis

```bash
# Using Docker
docker run -p 6379:6379 redis:latest

# Or using local installation
redis-server
```

### 5. Start the Service

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## API Endpoints

### Query Data
```http
POST /api/query
Content-Type: application/json

{
  "query": "bitcoin price analysis",
  "type": ["crypto", "news"],
  "limit": 10,
  "timeRange": {
    "start": "2024-01-01T00:00:00Z",
    "end": "2024-01-02T00:00:00Z"
  },
  "symbols": ["BTC", "ETH"]
}
```

### Get Recent Data
```http
GET /api/recent?type=news&limit=20
```

### Search by Symbol
```http
GET /api/symbol/AAPL?type=stock&limit=10
```

### Service Statistics
```http
GET /api/stats
```

### Health Check
```http
GET /health
```

### Manual Data Ingestion
```http
POST /api/ingest
Content-Type: application/json

{
  "type": "crypto"  // or "news", "stocks", "trends", "rates", "economic", "all"
}
```

### Clear Cache
```http
POST /api/cache/clear
Content-Type: application/json

{
  "pattern": "query:*"  // Redis key pattern
}
```

## Integration with Main API

The main Finsor API integrates with this service through the `DataService` client:

```typescript
import { dataService } from './services/dataService';

// Gather context for financial analysis
const context = await dataService.gatherContextForQuery("Should I invest in tech stocks?");

// Get specific market data
const cryptoData = await dataService.searchBySymbol("BTC", "crypto");
```

## Performance Considerations

1. **Caching Strategy**: Aggressive caching with different TTLs based on data volatility
2. **Rate Limiting**: API protection with configurable limits
3. **Batch Processing**: Data ingestion in optimal batch sizes
4. **Connection Pooling**: Efficient database connections
5. **Error Recovery**: Retry mechanisms with exponential backoff

## Monitoring

### Health Endpoint
The `/health` endpoint provides service status:

```json
{
  "status": "healthy",
  "services": {
    "vector": "healthy",
    "cache": "healthy"
  },
  "uptime": 3600,
  "memory": {...}
}
```

### Statistics Endpoint
The `/api/stats` endpoint provides operational metrics:

```json
{
  "vector": {
    "totalDocuments": 15420,
    "typeDistribution": {
      "news": 8500,
      "crypto": 3200,
      "stock": 2100,
      "economic": 890,
      "trends": 730
    },
    "latestTimestamp": "2024-01-15T10:30:00Z"
  },
  "cache": {
    "isConnected": true,
    "memoryUsage": "2.1MB",
    "totalKeys": 847
  },
  "scheduler": {
    "totalTasks": 6,
    "runningTasks": 6
  }
}
```

## Development

### Running Tests
```bash
npm test
```

### Linting
```bash
npm run lint
```

### Manual Data Seeding
```bash
npm run seed
```

## Troubleshooting

### Common Issues

1. **ChromaDB Connection Failed**
   - Ensure ChromaDB is running on correct host/port
   - Check firewall settings

2. **Redis Connection Issues**
   - Verify Redis is running and accessible
   - Check Redis URL configuration

3. **API Rate Limits**
   - Some data sources have rate limits
   - Free tiers may have reduced quotas

4. **Missing Data**
   - Check API keys are configured correctly
   - Verify data source URLs are accessible

### Logs

Service logs are written to:
- `logs/combined.log` - All logs
- `logs/error.log` - Error logs only

## Production Deployment

### Environment Variables
- Set `NODE_ENV=production`
- Configure proper logging levels
- Use production Redis and ChromaDB instances
- Set up monitoring and alerting

### Scaling Considerations
- ChromaDB can be scaled horizontally
- Redis clustering for high availability
- Load balancing for multiple service instances
- Monitoring memory usage and query performance

## License

ISC