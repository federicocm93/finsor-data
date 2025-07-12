import { ChromaClient, OpenAIEmbeddingFunction } from 'chromadb';
import { VectorData, DataSource, Reference } from '../types';
import { config } from '../config';
import logger from '../utils/logger';

export class VectorService {
  private chroma: ChromaClient;
  private embedder: OpenAIEmbeddingFunction;
  private collection: any;

  constructor() {
    this.chroma = new ChromaClient({
      path: `http://${config.chroma.host}:${config.chroma.port}`,
    });

    this.embedder = new OpenAIEmbeddingFunction({
      openai_api_key: config.openai.apiKey,
      openai_model: config.openai.model,
    });
  }

  async initialize(): Promise<void> {
    try {
      this.collection = await this.chroma.getOrCreateCollection({
        name: config.chroma.collectionName,
        embeddingFunction: this.embedder,
      });
      logger.info('Vector database initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize vector database:', error);
      throw error;
    }
  }

  async addData(data: DataSource[]): Promise<void> {
    try {
      const vectorData = await this.prepareVectorData(data);
      
      if (vectorData.length === 0) {
        return;
      }

      const ids = vectorData.map(d => d.id);
      const documents = vectorData.map(d => d.content);
      const metadatas = vectorData.map(d => d.metadata);

      await this.collection.add({
        ids,
        documents,
        metadatas,
      });

      logger.info(`Added ${vectorData.length} vectors to database`);
    } catch (error) {
      logger.error('Failed to add data to vector database:', error);
      throw error;
    }
  }

  async query(queryText: string, options: {
    type?: string[];
    limit?: number;
    timeRange?: { start: Date; end: Date };
    symbols?: string[];
  } = {}): Promise<{ results: VectorData[]; references: Reference[] }> {
    try {
      const { limit = 10, type, timeRange, symbols } = options;
      
      let conditions: any[] = [];
      
      // Add type condition
      if (type && type.length > 0) {
        if (type.length === 1) {
          conditions.push({ type: type[0] });
        } else {
          conditions.push({
            "$or": type.map(t => ({ type: t }))
          });
        }
      }
      
      // Add time range condition - temporarily disabled for debugging
      if (timeRange) {
        logger.info(`Timestamp filtering temporarily disabled - would filter: ${Math.floor(timeRange.start.getTime() / 1000)} <= timestamp <= ${Math.floor(timeRange.end.getTime() / 1000)}`);
        // Commented out for debugging ChromaDB compatibility issues
        // const startTimestamp = Math.floor(timeRange.start.getTime() / 1000);
        // const endTimestamp = Math.floor(timeRange.end.getTime() / 1000);
        // conditions.push({ timestamp: { "$gte": startTimestamp } });
        // conditions.push({ timestamp: { "$lte": endTimestamp } });
      }
      
      // Add symbol condition
      if (symbols && symbols.length > 0) {
        if (symbols.length === 1) {
          conditions.push({ symbol: symbols[0] });
        } else {
          conditions.push({
            "$or": symbols.map(s => ({ symbol: s }))
          });
        }
      }
      
      // Build final where clause
      let whereClause: any = {};
      if (conditions.length === 1) {
        whereClause = conditions[0];
      } else if (conditions.length > 1) {
        whereClause = { "$and": conditions };
      }
      
      logger.info(`Executing ChromaDB query with where clause: ${JSON.stringify(whereClause)}`);
      
      const results = await this.collection.query({
        queryTexts: [queryText],
        nResults: limit,
        where: Object.keys(whereClause).length > 0 ? whereClause : undefined,
      });
      
      logger.info(`ChromaDB query completed successfully, returned ${results.documents?.[0]?.length || 0} results`);

      const formattedResults = this.formatQueryResults(results);
      const references = this.extractReferences(formattedResults);
      
      return { results: formattedResults, references };
    } catch (error) {
      logger.error('Failed to query vector database:', error);
      throw error;
    }
  }

  async getStats(): Promise<{
    totalDocuments: number;
    typeDistribution: Record<string, number>;
    latestTimestamp: string;
  }> {
    try {
      const result = await this.collection.count();
      
      // Get sample to analyze distribution
      const sample = await this.collection.get({
        limit: 1000,
      });

      const typeDistribution: Record<string, number> = {};
      let latestTimestamp = new Date(0);

      if (sample.metadatas) {
        sample.metadatas.forEach((metadata: any) => {
          const type = metadata.type || 'unknown';
          typeDistribution[type] = (typeDistribution[type] || 0) + 1;
          
          const timestamp = new Date(metadata.timestamp * 1000);
          if (timestamp > latestTimestamp) {
            latestTimestamp = timestamp;
          }
        });
      }

      return {
        totalDocuments: result,
        typeDistribution,
        latestTimestamp: latestTimestamp.toISOString(),
      };
    } catch (error) {
      logger.error('Failed to get vector database stats:', error);
      throw error;
    }
  }

  private async prepareVectorData(data: DataSource[]): Promise<VectorData[]> {
    return data.map(item => ({
      id: this.generateId(item),
      embedding: [], // ChromaDB handles embeddings
      metadata: {
        source: item.source,
        type: item.type,
        timestamp: Math.floor(item.timestamp.getTime() / 1000),
        symbol: item.symbol,
        ...item.metadata,
      },
      content: item.content,
    }));
  }

  private generateId(item: DataSource): string {
    const timestamp = item.timestamp.getTime();
    const content = item.content.slice(0, 50);
    const hash = Buffer.from(content).toString('base64').slice(0, 10);
    return `${item.type}_${item.source}_${timestamp}_${hash}`;
  }

  private formatQueryResults(results: any): VectorData[] {
    if (!results.documents || !results.documents[0]) {
      return [];
    }

    const documents = results.documents[0];
    const metadatas = results.metadatas[0] || [];
    const distances = results.distances[0] || [];
    const ids = results.ids[0] || [];

    return documents.map((doc: string, index: number) => ({
      id: ids[index] || `result_${index}`,
      embedding: [], // Not returned in query results
      metadata: metadatas[index] || {},
      content: doc,
      distance: distances[index],
    }));
  }

  private extractReferences(results: VectorData[]): Reference[] {
    return results.map(result => ({
      id: result.id,
      source: result.metadata.source,
      type: result.metadata.type,
      timestamp: new Date(result.metadata.timestamp * 1000),
      url: result.metadata.url,
      title: result.metadata.title,
      symbol: result.metadata.symbol,
    }));
  }
}