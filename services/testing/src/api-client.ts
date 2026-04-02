import axios from 'axios';

// 1. Read the target environment (injected by the Express route)
const targetEnv = process.env.TEST_TARGET_ENV || 'local';
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

// 3. Export the singleton client that the tests will use
export const api = axios.create({
  baseURL: config.url,
  headers: {
    'Content-Type': 'application/json',
    ...(apikey ? { 'X-API-Key': apikey } : {})
  },
  timeout: 30000
});

console.log(`🧪 Test Client Initialized -> Target: ${targetEnv.toUpperCase()} (${config.url})`);