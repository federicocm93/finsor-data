export interface DataSource {
  type: 'news' | 'crypto' | 'stock' | 'trends' | 'rates' | 'economic';
  symbol?: string;
  source: string;
  timestamp: Date;
  content: string;
  metadata: Record<string, any>;
}

export interface VectorData {
  id: string;
  embedding: number[];
  metadata: {
    source: string;
    type: string;
    timestamp: number;
    symbol?: string;
    [key: string]: any;
  };
  content: string;
}

export interface NewsItem {
  title: string;
  description: string;
  url: string;
  publishedAt: Date;
  source: string;
  sentiment?: number;
}

export interface MarketData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
  marketCap?: number;
  timestamp: Date;
}

export interface CryptoData extends MarketData {
  marketCapRank?: number;
  totalSupply?: number;
  circulatingSupply?: number;
}

export interface TrendsData {
  keyword: string;
  interest: number;
  timestamp: Date;
  geo?: string;
}

export interface CentralBankRate {
  country: string;
  rate: number;
  lastUpdate: Date;
  currency: string;
}

export interface EconomicIndicator {
  indicator: string;
  value: number;
  country: string;
  timestamp: Date;
  unit: string;
}

export interface QueryRequest {
  query: string;
  type?: string[];
  limit?: number;
  timeRange?: {
    start: Date;
    end: Date;
  };
  symbols?: string[];
}

export interface QueryResponse {
  results: VectorData[];
  total: number;
  query: string;
  processingTime: number;
}

export interface IngestionConfig {
  sources: {
    news: {
      enabled: boolean;
      frequency: string;
      sources: string[];
    };
    crypto: {
      enabled: boolean;
      frequency: string;
      symbols: string[];
    };
    stocks: {
      enabled: boolean;
      frequency: string;
      symbols: string[];
    };
    trends: {
      enabled: boolean;
      frequency: string;
      keywords: string[];
    };
    rates: {
      enabled: boolean;
      frequency: string;
      countries: string[];
    };
    economic: {
      enabled: boolean;
      frequency: string;
      indicators: string[];
    };
  };
}