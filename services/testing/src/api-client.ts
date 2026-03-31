import axios from 'axios';
import 'dotenv/config';

export const api = axios.create({
  headers: {
    ...(process.env.MY_API_KEY ? { 'X-API-Key': process.env.MY_API_KEY } : {}),
    'Content-Type': 'application/json'
  },
  ...(process.env.TARGET_API_URL ? { baseURL: process.env.TARGET_API_URL } : {})
});