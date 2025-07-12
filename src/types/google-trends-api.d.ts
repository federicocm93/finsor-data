declare module 'google-trends-api' {
  interface InterestOverTimeOptions {
    keyword: string;
    startTime?: Date;
    endTime?: Date;
    granularTimeUnit?: 'day' | 'week' | 'month';
    geo?: string;
  }

  function interestOverTime(options: InterestOverTimeOptions): Promise<string>;
  
  const googleTrends: {
    interestOverTime: typeof interestOverTime;
  };
  
  export = googleTrends;
}