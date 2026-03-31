// utils/logger.ts
export const logger = {
  info: (message: string, context = {}) => {
    console.log(JSON.stringify({ level: "INFO", message, timestamp: new Date().toISOString(), ...context }));
  },
  error: (message: string, error: any, context = {}) => {
    console.error(JSON.stringify({ level: "ERROR", message, error: error.message, timestamp: new Date().toISOString(), ...context }));
  }
};

// Usage
// logger.info("Successfully fetched sentiment", { keyword: "economy", articleCount: 42 });
// logger.error("S3 fetch failed", error, { bucket: process.env.NEWS_DATA_BUCKET });