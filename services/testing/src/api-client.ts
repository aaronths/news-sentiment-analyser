import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// 1. Read the target environment (injected by the Express route)
const targetEnv = (process.env.TEST_TARGET_ENV || process.env.NODE_ENV || 'local').toLowerCase();

const envCandidates = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), '../../.env'),
  path.resolve(process.cwd(), `.env.${targetEnv}`),
  path.resolve(process.cwd(), `../../.env.${targetEnv}`),
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath, override: false });
  }
}

// 2. Map environments to their specific AWS URLs and Keys
// (You will set the actual API keys in the AWS Lambda Environment Variables console)
const ENV_CONFIG = {
  local: {
    url: process.env.LOCAL_API_URL || process.env.TARGET_API_URL || 'http://localhost:8001',
    key: process.env.LOCAL_API_KEY || process.env.X_API_KEY
  },
  dev: {
    url: process.env.DEV_API_URL || process.env.TARGET_API_URL || 'https://mbqiv0owad.execute-api.us-east-1.amazonaws.com/dev',
    key: process.env.DEV_API_KEY || process.env.X_API_KEY
  },
  prod: {
    url: process.env.PROD_API_URL || process.env.TARGET_API_URL || 'https://mbqiv0owad.execute-api.us-east-1.amazonaws.com/prod',
    key: process.env.PROD_API_KEY || process.env.X_API_KEY
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