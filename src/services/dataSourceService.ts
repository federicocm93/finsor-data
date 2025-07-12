import axios from 'axios';
import RSSParser from 'rss-parser';
import googleTrends = require('google-trends-api');
import { DataSource } from '../types';
import { config } from '../config';
import logger from '../utils/logger';

export class DataSourceService {
  private rssParser: RSSParser;

  constructor() {
    this.rssParser = new RSSParser();
  }

  async fetchNews(): Promise<DataSource[]> {
    try {
      const sources = [
        'https://feeds.finance.yahoo.com/rss/2.0/headline',
        'https://www.cnbc.com/id/100003114/device/rss/rss.html',
        'https://www.marketwatch.com/rss/topstories',
        'https://seekingalpha.com/market_currents.xml',
      ];

      const allNews: DataSource[] = [];

      for (const source of sources) {
        try {
          const feed = await this.rssParser.parseURL(source);
          
          for (const item of feed.items.slice(0, 20)) {
            if (item.title && item.contentSnippet) {
              allNews.push({
                type: 'news',
                source: feed.title || source,
                timestamp: new Date(item.pubDate || Date.now()),
                content: `${item.title}\n\n${item.contentSnippet}`,
                metadata: {
                  url: item.link,
                  author: item.creator,
                  categories: item.categories,
                },
              });
            }
          }
        } catch (error) {
          logger.warn(`Failed to fetch from ${source}:`, error);
        }
      }

      logger.info(`Fetched ${allNews.length} news items`);
      return allNews;
    } catch (error) {
      logger.error('Failed to fetch news:', error);
      throw error;
    }
  }

  async fetchCryptoData(symbols: string[] = ['bitcoin', 'ethereum', 'cardano', 'solana', 'polygon']): Promise<DataSource[]> {
    try {
      const response = await axios.get(`${config.dataSources.coinGecko.baseUrl}/simple/price`, {
        params: {
          ids: symbols.join(','),
          vs_currencies: 'usd',
          include_market_cap: true,
          include_24hr_vol: true,
          include_24hr_change: true,
        },
      });

      const cryptoData: DataSource[] = [];
      
      for (const [symbol, data] of Object.entries(response.data)) {
        const cryptoInfo = data as any;
        
        cryptoData.push({
          type: 'crypto',
          symbol: symbol.toUpperCase(),
          source: 'CoinGecko',
          timestamp: new Date(),
          content: `${symbol.toUpperCase()} price: $${cryptoInfo.usd}. 24h change: ${cryptoInfo.usd_24h_change?.toFixed(2)}%. Market cap: $${cryptoInfo.usd_market_cap?.toLocaleString()}. Volume: $${cryptoInfo.usd_24h_vol?.toLocaleString()}.`,
          metadata: {
            price: cryptoInfo.usd,
            change24h: cryptoInfo.usd_24h_change,
            marketCap: cryptoInfo.usd_market_cap,
            volume24h: cryptoInfo.usd_24h_vol,
          },
        });
      }

      logger.info(`Fetched ${cryptoData.length} crypto data points`);
      return cryptoData;
    } catch (error) {
      logger.error('Failed to fetch crypto data:', error);
      throw error;
    }
  }

  async fetchStockData(symbols: string[] = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'NVDA', 'SPY', 'QQQ']): Promise<DataSource[]> {
    try {
      if (!config.dataSources.alphaVantage.apiKey) {
        logger.warn('Alpha Vantage API key not configured, skipping stock data');
        return [];
      }

      const stockData: DataSource[] = [];

      for (const symbol of symbols) {
        try {
          const response = await axios.get(config.dataSources.alphaVantage.baseUrl, {
            params: {
              function: 'GLOBAL_QUOTE',
              symbol,
              apikey: config.dataSources.alphaVantage.apiKey,
            },
          });

          const quote = response.data['Global Quote'];
          if (quote && quote['05. price']) {
            stockData.push({
              type: 'stock',
              symbol,
              source: 'Alpha Vantage',
              timestamp: new Date(),
              content: `${symbol} stock price: $${quote['05. price']}. Change: ${quote['09. change']} (${quote['10. change percent']}). Volume: ${quote['06. volume']}. Previous close: $${quote['08. previous close']}.`,
              metadata: {
                price: parseFloat(quote['05. price']),
                change: parseFloat(quote['09. change']),
                changePercent: quote['10. change percent'],
                volume: parseInt(quote['06. volume']),
                previousClose: parseFloat(quote['08. previous close']),
                high: parseFloat(quote['03. high']),
                low: parseFloat(quote['04. low']),
                open: parseFloat(quote['02. open']),
              },
            });
          }

          // Rate limit for Alpha Vantage (5 calls per minute for free tier)
          await new Promise(resolve => setTimeout(resolve, 12000));
        } catch (error) {
          logger.warn(`Failed to fetch stock data for ${symbol}:`, error);
        }
      }

      logger.info(`Fetched ${stockData.length} stock data points`);
      return stockData;
    } catch (error) {
      logger.error('Failed to fetch stock data:', error);
      throw error;
    }
  }

  async fetchTrendsData(keywords: string[] = ['bitcoin', 'stocks', 'inflation', 'economy', 'market crash']): Promise<DataSource[]> {
    try {
      const trendsData: DataSource[] = [];

      for (const keyword of keywords) {
        try {
          const results = await googleTrends.interestOverTime({
            keyword,
            startTime: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
            granularTimeUnit: 'day',
          });

          const data = JSON.parse(results);
          if (data.default && data.default.timelineData) {
            const latestData = data.default.timelineData[data.default.timelineData.length - 1];
            
            trendsData.push({
              type: 'trends',
              source: 'Google Trends',
              timestamp: new Date(),
              content: `Google Trends for "${keyword}": Interest level ${latestData.value[0]} out of 100. Trend analysis shows search interest patterns for financial keyword "${keyword}".`,
              metadata: {
                keyword,
                interest: latestData.value[0],
                timeframe: '7days',
                geo: 'US',
              },
            });
          }

          // Rate limit for Google Trends
          await new Promise(resolve => setTimeout(resolve, 2000));
        } catch (error) {
          logger.warn(`Failed to fetch trends for ${keyword}:`, error);
        }
      }

      logger.info(`Fetched ${trendsData.length} trends data points`);
      return trendsData;
    } catch (error) {
      logger.error('Failed to fetch trends data:', error);
      throw error;
    }
  }

  async fetchCentralBankRates(): Promise<DataSource[]> {
    try {
      if (!config.dataSources.fred.apiKey) {
        logger.warn('FRED API key not configured, skipping central bank rates');
        return [];
      }

      const rates = [
        { series: 'FEDFUNDS', country: 'United States', currency: 'USD', name: 'Federal Funds Rate' },
        { series: 'INTGSTEUR', country: 'Eurozone', currency: 'EUR', name: 'ECB Interest Rate' },
        { series: 'INTGSTGBR', country: 'United Kingdom', currency: 'GBP', name: 'Bank of England Rate' },
        { series: 'INTGSTJPM', country: 'Japan', currency: 'JPY', name: 'Bank of Japan Rate' },
      ];

      const ratesData: DataSource[] = [];

      for (const rate of rates) {
        try {
          const response = await axios.get(`${config.dataSources.fred.baseUrl}/series/observations`, {
            params: {
              series_id: rate.series,
              api_key: config.dataSources.fred.apiKey,
              file_type: 'json',
              limit: 1,
              sort_order: 'desc',
            },
          });

          const observations = response.data.observations;
          if (observations && observations.length > 0) {
            const latest = observations[0];
            
            ratesData.push({
              type: 'rates',
              source: 'FRED',
              timestamp: new Date(),
              content: `${rate.name} (${rate.country}): ${latest.value}% as of ${latest.date}. Central bank interest rate affecting ${rate.currency} monetary policy and financial markets.`,
              metadata: {
                country: rate.country,
                currency: rate.currency,
                rate: parseFloat(latest.value),
                date: latest.date,
                series: rate.series,
                name: rate.name,
              },
            });
          }

          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          logger.warn(`Failed to fetch rate for ${rate.series}:`, error);
        }
      }

      logger.info(`Fetched ${ratesData.length} central bank rates`);
      return ratesData;
    } catch (error) {
      logger.error('Failed to fetch central bank rates:', error);
      throw error;
    }
  }

  async fetchEconomicIndicators(): Promise<DataSource[]> {
    try {
      if (!config.dataSources.fred.apiKey) {
        logger.warn('FRED API key not configured, skipping economic indicators');
        return [];
      }

      const indicators = [
        { series: 'CPIAUCSL', name: 'Consumer Price Index', unit: 'Index' },
        { series: 'UNRATE', name: 'Unemployment Rate', unit: 'Percent' },
        { series: 'GDP', name: 'Gross Domestic Product', unit: 'Billions of Dollars' },
        { series: 'PAYEMS', name: 'Nonfarm Payrolls', unit: 'Thousands' },
        { series: 'DGS10', name: '10-Year Treasury Rate', unit: 'Percent' },
      ];

      const indicatorData: DataSource[] = [];

      for (const indicator of indicators) {
        try {
          const response = await axios.get(`${config.dataSources.fred.baseUrl}/series/observations`, {
            params: {
              series_id: indicator.series,
              api_key: config.dataSources.fred.apiKey,
              file_type: 'json',
              limit: 1,
              sort_order: 'desc',
            },
          });

          const observations = response.data.observations;
          if (observations && observations.length > 0) {
            const latest = observations[0];
            
            indicatorData.push({
              type: 'economic',
              source: 'FRED',
              timestamp: new Date(),
              content: `${indicator.name}: ${latest.value} ${indicator.unit} as of ${latest.date}. Key economic indicator for United States financial and economic analysis.`,
              metadata: {
                indicator: indicator.name,
                value: parseFloat(latest.value),
                unit: indicator.unit,
                date: latest.date,
                series: indicator.series,
                country: 'United States',
              },
            });
          }

          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          logger.warn(`Failed to fetch indicator ${indicator.series}:`, error);
        }
      }

      logger.info(`Fetched ${indicatorData.length} economic indicators`);
      return indicatorData;
    } catch (error) {
      logger.error('Failed to fetch economic indicators:', error);
      throw error;
    }
  }
}