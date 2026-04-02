import axios from 'axios';

// 1. Read the target environment (injected by the Express route)
const targetEnv = process.env.TEST_TARGET_ENV || 'local';

// 2. Map environments to their specific AWS URLs and Keys
// (You will set the actual API keys in the AWS Lambda Environment Variables console)
const ENV_CONFIG = {
  local: {
    url: 'http://localhost:8001',
    key: process.env.LOCAL_API_KEY
  },
  dev: {
    url: 'https://mbqiv0owad.execute-api.us-east-1.amazonaws.com/dev',
    key: 'process.env.DEV_API_KEY'
  },
  prod: {
    url: 'https://mbqiv0owad.execute-api.us-east-1.amazonaws.com/prod',
    key: process.env.PROD_API_KEY
  }
};

const config = ENV_CONFIG[targetEnv as keyof typeof ENV_CONFIG] || ENV_CONFIG.local;

if (!config.url) {
  throw new Error(`❌ Missing URL configuration for environment: ${targetEnv}`);
}

export const authHeaders = config.key
  ? { 'X-API-Key': config.key }
  : {};

// 3. Export the singleton client that the tests will use
export const api = axios.create({
  baseURL: config.url,
  headers: {
    'Content-Type': 'application/json'
  },
  timeout: 60000
});

console.log(`🧪 Test Client Initialized -> Target: ${targetEnv.toUpperCase()} (${config.url})`);