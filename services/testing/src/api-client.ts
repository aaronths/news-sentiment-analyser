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
const apikey = process.env.API_KEY || '';

// 2. Map environments to their specific AWS URLs and Keys
// (You will set the actual API keys in the AWS Lambda Environment Variables console)
const ENV_CONFIG = {
  local: { 
    url: 'http://localhost:8001'
  },
  dev: { 
    url: 'https://mbqiv0owad.execute-api.us-east-1.amazonaws.com/dev'
  },
  prod: { 
    url: 'https://7l6czvdc4f.execute-api.us-east-1.amazonaws.com/prod/'

  }
};

const config = { 
    url: 'https://mbqiv0owad.execute-api.us-east-1.amazonaws.com/dev'
  };

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
    'Content-Type': 'application/json',
    ...(apikey ? { 'X-API-Key': apikey } : {})
  },
  timeout: 60000
});

console.log(`🧪 Test Client Initialized -> Target: ${targetEnv.toUpperCase()} (${config.url})`);