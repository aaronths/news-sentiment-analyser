/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "fs";
import path from "path";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
// resolver sometimes ignores our ambient declaration; suppress with ignore
// to keep ts-node-dev happy during dev
import vader from "vader-sentiment";

const analyzer = vader.SentimentIntensityAnalyzer;
const CACHE_TTL_SECONDS = parseInt(process.env.RUNTIME_CACHE_TTL_SECONDS || "300", 10);

let _cachedArticles: any[] = [];
let _cachedLoadedAt = 0;

function buildMatchHaystack(article: any): string {
  return [
    String(article.title || ""),
    String(article.body || ""),
    Array.isArray(article.keywordTokens) ? article.keywordTokens.join(" ") : "",
  ]
    .join(" ")
    .toLowerCase();
}

function labelForCompound(compound: number): string {
  if (compound >= 0.05) return "positive";
  if (compound <= -0.05) return "negative";
  return "neutral";
}

function parseLimit(raw?: string | null): number {
  if (!raw) {
    return 20;
  }
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return 20;
  return Math.min(Math.max(n, 1), 100);
}

function loadLocalFallback(): any[] {
  // try reading global data/clean-articles.json at repository root
  // __dirname sits in services/data-retrieval/src/services when run via ts-node
  // that means we need four ".." segments to reach the repository root.
  const localPath = path.resolve(__dirname, "../../../../data/clean-articles.json");
  try {
    const txt = fs.readFileSync(localPath, "utf-8");
    const payload = JSON.parse(txt);
    return Array.isArray(payload) ? payload : [];
  } catch {
    return [];
  }
}

async function loadCleanArticles(): Promise<any[]> {
  const now = Date.now();
  if (_cachedArticles.length && now - _cachedLoadedAt < CACHE_TTL_SECONDS * 1000) {
    return _cachedArticles;
  }

  const bucket = (process.env.NEWS_DATA_BUCKET || "").trim();
  const key = (process.env.NEWS_DATA_CLEAN_KEY || "clean/clean-articles.json").trim();

  if (!bucket) {
    _cachedArticles = loadLocalFallback();
    _cachedLoadedAt = now;
    return _cachedArticles;
  }

  try {
    const s3 = new S3Client({});
    const cmd = new GetObjectCommand({ Bucket: bucket, Key: key });
    const res = await s3.send(cmd);
    // body is a stream
    const bodyString = await streamToString(res.Body as any);
    const payload = JSON.parse(bodyString);
    _cachedArticles = Array.isArray(payload) ? payload : [];
    _cachedLoadedAt = now;
    return _cachedArticles;
  } catch {
    _cachedArticles = loadLocalFallback();
    _cachedLoadedAt = now;
    return _cachedArticles;
  }
}

async function streamToString(stream: any): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: any[] = [];
    stream.on("data", (chunk: any) => chunks.push(Buffer.from(chunk)));
    stream.on("error", (err: any) => reject(err));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
  });
}

export async function searchArticles(keyword: string, sourceId?: string): Promise<any[]> {
  const normalized = keyword.toLowerCase();
  const articles = await loadCleanArticles();
  return articles.filter((article) => {
    const hay = buildMatchHaystack(article);
    if (!hay.includes(normalized)) return false;
    if (sourceId && String(article.sourceId) !== sourceId) return false;
    return true;
  });
}

export async function computeSentimentForArticles(articles: any[]) {
  const scored: any[] = [];
  for (const article of articles) {
    const text = String(article.sentimentText || article.body || article.title || "");
    const scores = analyzer.polarity_scores(text);
    scored.push({ article, scores });
  }
  return scored;
}

export { buildMatchHaystack, labelForCompound, parseLimit, loadCleanArticles };
