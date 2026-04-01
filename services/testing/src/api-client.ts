import axios from 'axios';
import dotenv from 'dotenv';
import path from 'path';

// Default to 'local' if NODE_ENV isn't set + load the corresponding .env file
const env = process.env.NODE_ENV || 'local';
const envFile = `.env.${env}`;
// look for the .env file in the project root (3 levels up from src/)
const envPath = path.resolve(__dirname, '../../../', envFile);
dotenv.config({ path: envPath });

// grab variables
const baseURL = process.env.TARGET_API_URL;
const apiKey = process.env.X_API_KEY;

// validate url
if (!baseURL) {
  throw new Error(`❌ TARGET_API_URL is missing in ${envFile}`);
}

// create the client
export const api = axios.create({
  baseURL: baseURL, // TypeScript now knows this is definitely a string
  headers: {
    'Content-Type': 'application/json',
    ...(apiKey ? { 'X-API-Key': apiKey } : {})
  },
  timeout: process.env.NODE_ENV === 'local' ? 30000 : 60000 // 60s for Cloud
});

console.log(`Testing Environment: ${env.toUpperCase()}`);
console.log(`Target URL: ${baseURL}`);