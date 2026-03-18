/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "fs";
import path from "path";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
// resolver sometimes ignores our ambient declaration; suppress with ignore
// to keep ts-node-dev happy during dev
import vader from "vader-sentiment";

const analyzer = vader.SentimentIntensityAnalyzer;
const CACHE_TTL_SECONDS = parseInt(process.env.RUNTIME_CACHE_TTL_SECONDS || "300", 10);

export type Timeframe = "24h" | "7d" | "30d";

interface SourceSummary {
  id: string;
  name: string;
  url: string;
  articleCount: number;
  latestPublishedAt: string;
}

const TIMEFRAME_HOURS: Record<Timeframe, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

let _cachedArticles: any[] = [];
let _cachedLoadedAt = 0;

function parsePrecomputedCompound(article: any): number | null {
  const candidates = [
    article?.sentiment,
    article?.sentimentScore,
    article?.compound,
    article?.sentimentCompound,
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === "") {
      continue;
    }

    const parsed = Number(candidate);
    if (!Number.isFinite(parsed)) {
      continue;
    }

    return Math.min(Math.max(parsed, -1), 1);
  }

  return null;
}

function scoresFromCompound(compound: number) {
  const magnitude = Math.min(Math.abs(compound), 1);
  const roundedCompound = Number(compound.toFixed(4));

  return {
    compound: roundedCompound,
    pos: compound > 0 ? Number(magnitude.toFixed(4)) : 0,
    neg: compound < 0 ? Number(magnitude.toFixed(4)) : 0,
    neu: Number((1 - magnitude).toFixed(4)),
  };
}

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

function resolveLocalFallbackPath(): string | null {
  const configuredPath = String(process.env.NEWS_DATA_LOCAL_CLEAN_PATH || "").trim();
  const candidates = [
    configuredPath ? path.resolve(process.cwd(), configuredPath) : "",
    // common working-directory locations
    path.resolve(process.cwd(), "data/clean-articles.json"),
    path.resolve(process.cwd(), "../../data/clean-articles.json"),
    // source runtime: services/data-retrieval/src/services
    path.resolve(__dirname, "../../../../data/clean-articles.json"),
    // dist runtime: services/data-retrieval/dist/src/services
    path.resolve(__dirname, "../../../../../data/clean-articles.json"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0] || null;
}

function parseTimeframe(raw: string | undefined, fallback: Timeframe): Timeframe | null {
  const normalized = (raw || "").trim();
  if (!normalized) {
    return fallback;
  }
  if (normalized === "24h" || normalized === "7d" || normalized === "30d") {
    return normalized;
  }
  return null;
}

function timeframeStartDate(timeframe: Timeframe, now = new Date()): Date {
  const start = new Date(now);
  start.setHours(start.getHours() - TIMEFRAME_HOURS[timeframe]);
  return start;
}

function filterArticlesByDateRange(
  articles: any[],
  startDate?: string,
  endDate?: string,
): any[] {
  let start: Date | undefined;
  let end: Date | undefined;

  if (startDate) {
    const parsed = new Date(startDate);
    if (Number.isNaN(parsed.getTime())) {
      return [];
    }
    start = parsed;
  }

  if (endDate) {
    const parsed = new Date(endDate);
    if (Number.isNaN(parsed.getTime())) {
      return [];
    }
    end = parsed;
  }

  if (!start && !end) {
    return articles;
  }

  return articles.filter((article) => {
    const published = new Date(String(article.publishedAt || ""));
    if (Number.isNaN(published.getTime())) {
      return false;
    }
    if (start && published < start) {
      return false;
    }
    if (end && published > end) {
      return false;
    }
    return true;
  });
}

function filterArticlesByTimeframe(articles: any[], timeframe: Timeframe): any[] {
  const start = timeframeStartDate(timeframe);
  return articles.filter((article) => {
    const published = new Date(String(article.publishedAt || ""));
    if (Number.isNaN(published.getTime())) {
      return false;
    }
    return published >= start;
  });
}

function deriveSourceUrl(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

function aggregateSources(articles: any[]): SourceSummary[] {
  const sources = new Map<string, SourceSummary>();

  for (const article of articles) {
    const id = String(article.sourceId || "").trim();
    if (!id) {
      continue;
    }

    const publishedAt = String(article.publishedAt || "");
    const existing = sources.get(id);

    if (!existing) {
      sources.set(id, {
        id,
        name: String(article.sourceName || id),
        url: deriveSourceUrl(String(article.url || "")),
        articleCount: 1,
        latestPublishedAt: publishedAt,
      });
      continue;
    }

    existing.articleCount += 1;
    if (publishedAt && publishedAt > existing.latestPublishedAt) {
      existing.latestPublishedAt = publishedAt;
    }
  }

  return Array.from(sources.values()).sort((a, b) => b.articleCount - a.articleCount);
}

function getTrendingKeywords(articles: any[], limit: number) {
  const stopwords = new Set([
    // Common stopwords and filler words
    "the",
    "and",
    "for",
    "with",
    "that",
    "this",
    "from",
    "have",
    "has",
    "are",
    "was",
    "were",
    "will",
    "your",
    "you",
    "about",
    "their",
    "they",
    "them",
    "but",
    "not",
    "what",
    "when",
    "where",
    "which",
    "who",
    "why",
    "how",
    "been",
    "into",
    "over",
    "more",
    "also",
    "only",
    "just",
    "like",
    "new",
    "news",
    "today",
    "video",
    "watch",
  ]);

  const counts = new Map<string, number>();
  const docFrequency = new Map<string, number>();

  for (const article of articles) {
    const seen = new Set<string>();
    const tokens = Array.isArray(article.keywordTokens)
      ? article.keywordTokens
      : String(article.title || "")
          .toLowerCase()
          .match(/[a-z0-9]+/g) || [];

    for (const token of tokens) {
      const normalized = String(token || "").trim().toLowerCase();
      if (!normalized || normalized.length < 4 || stopwords.has(normalized)) {
        continue;
      }

      counts.set(normalized, (counts.get(normalized) || 0) + 1);
      if (!seen.has(normalized)) {
        seen.add(normalized);
        docFrequency.set(normalized, (docFrequency.get(normalized) || 0) + 1);
      }
    }
  }

  // Exclude terms that appear in more than this fraction of articles.
  // Lower threshold means we treat more words as "too common" (e.g., {}
  // or "people") and thus exclude them from trending keywords.
  const threshold = Math.max(1, Math.floor(articles.length * 0.25));

  return Array.from(counts.entries())
    .filter(([keyword]) => (docFrequency.get(keyword) ?? 0) <= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([keyword, count]) => ({ keyword, count }));
}

function loadLocalFallback(): any[] {
  const localPath = resolveLocalFallbackPath();
  if (!localPath) {
    return [];
  }

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
    const precomputed = parsePrecomputedCompound(article);
    const scores =
      precomputed !== null
        ? scoresFromCompound(precomputed)
        : analyzer.polarity_scores(
            String(article.sentimentText || article.body || article.title || "")
          );
    scored.push({ article, scores });
  }
  return scored;
}

export {
  aggregateSources,
  buildMatchHaystack,
  filterArticlesByDateRange,
  filterArticlesByTimeframe,
  timeframeStartDate,
  getTrendingKeywords,
  labelForCompound,
  loadCleanArticles,
  parseLimit,
  parseTimeframe,
};
