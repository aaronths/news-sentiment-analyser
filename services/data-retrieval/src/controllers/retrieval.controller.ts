import crypto from "crypto";
import { Request, Response } from "express";
import {
  aggregateSources,
  searchArticles,
  computeSentimentForArticles,
  filterArticlesByDateRange,
  filterArticlesByTimeframe,
  getTrendingKeywords,
  loadCleanArticles,
  parseLimit,
  parseTimeframe,
  timeframeStartDate,
  labelForCompound,
  Timeframe,
} from "../services/articles.service";

// health/test helper that's kept for backwards compatibility
export const performTest = async (req: Request, res: Response) => {
  res.json({ success: true });
};

// /api/articles?keyword=...&limit=&startDate=&endDate=
export const getArticles = async (req: Request, res: Response) => {
  const keyword = String(req.query.keyword || "").trim();
  if (!keyword) {
    return res.status(400).json({ code: 400, message: "keyword required" });
  }

  const sourceId = String(req.query.sourceId || "").trim() || undefined;
  const limit = parseLimit(String(req.query.limit || ""));
  const startDate = String(req.query.startDate || "").trim() || undefined;
  const endDate = String(req.query.endDate || "").trim() || undefined;

  const matched = filterArticlesByDateRange(
    await searchArticles(keyword, sourceId),
    startDate,
    endDate,
  );

  // compute sentiment rankings similar to the Python runtime
  const scored = await computeSentimentForArticles(matched);

  // using any here keeps the ranking logic simple; data comes from the article pool
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const outlets: Record<string, any> = {};
  for (const entry of scored) {
    const article = entry.article;
    const scores = entry.scores;
    const key = String(article.sourceId);
    const outlet = (outlets[key] ||= {
      sourceId: article.sourceId,
      sourceName: article.sourceName,
      articleCount: 0,
      compoundScores: [] as number[],
      positiveScores: [] as number[],
      negativeScores: [] as number[],
      neutralScores: [] as number[],
    });
    outlet.articleCount += 1;
    outlet.compoundScores.push(scores.compound);
    outlet.positiveScores.push(scores.pos);
    outlet.negativeScores.push(scores.neg);
    outlet.neutralScores.push(scores.neu);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rankings: any[] = [];
  for (const outlet of Object.values(outlets)) {
    const avgCompound =
      outlet.compoundScores.reduce((a: number, b: number) => a + b, 0) /
      outlet.compoundScores.length;
    rankings.push({
      sourceId: outlet.sourceId,
      sourceName: outlet.sourceName,
      articleCount: outlet.articleCount,
      averageCompound: Number(avgCompound.toFixed(4)),
      averagePositive: Number(
        (outlet.positiveScores.reduce((a: number, b: number) => a + b, 0) /
          outlet.positiveScores.length).toFixed(4)
      ),
      averageNegative: Number(
        (outlet.negativeScores.reduce((a: number, b: number) => a + b, 0) /
          outlet.negativeScores.length).toFixed(4)
      ),
      averageNeutral: Number(
        (outlet.neutralScores.reduce((a: number, b: number) => a + b, 0) /
          outlet.neutralScores.length).toFixed(4)
      ),
      sentimentLabel: labelForCompound(avgCompound),
    });
  }
  rankings.sort((a, b) => b.averageCompound - a.averageCompound);

  const topArticles = scored
    .sort((a, b) => b.scores.compound - a.scores.compound)
    .slice(0, limit)
    .map((entry) => ({
      sourceId: entry.article.sourceId,
      sourceName: entry.article.sourceName,
      title: entry.article.title,
      summary: entry.article.summary,
      publishedAt: entry.article.publishedAt,
      url: entry.article.url,
      compound: Number(entry.scores.compound.toFixed(4)),
    }));

  res.json({
    keyword,
    totalMatches: matched.length,
    rankings,
    articles: topArticles,
    self: `?keyword=${encodeURIComponent(keyword)}&sourceId=${encodeURIComponent(
      sourceId || ""
    )}&limit=${limit}&startDate=${encodeURIComponent(
      startDate || ""
    )}&endDate=${encodeURIComponent(endDate || "")}`,
  });
};

export const getArticleMetadata = async (req: Request, res: Response) => {
  const keyword = String(req.query.keyword || "").trim();
  if (!keyword) {
    return res.status(400).json({ code: 400, message: "keyword required" });
  }

  const matched = await searchArticles(keyword);
  const metadata = matched.map((a) => ({
    id: a.id,
    title: a.title,
    author: a.author,
    source: a.sourceName,
    publishedAt: a.publishedAt,
  }));
  res.json(metadata);
};

export const getArticleById = async (req: Request, res: Response) => {
  const { id } = req.params as { id?: string };
  if (!id) {
    return res.status(400).json({ code: 400, message: "id path parameter required" });
  }

  const articles = await searchArticles("");
  const found = articles.find((a) => String(a.id) === id);
  if (!found) {
    return res.status(404).json({ code: 404, message: "Article could not be found (invalid article id)" });
  }
  res.json(found);
};

export const getArticleSentiment = async (req: Request, res: Response) => {
  const { id } = req.params as { id?: string };
  if (!id) {
    return res.status(400).json({ code: 400, message: "id path parameter required" });
  }
  const articles = await searchArticles("");
  const found = articles.find((a) => String(a.id) === id);
  if (!found) {
    return res.status(404).json({ code: 404, message: "Article could not be found (invalid article id)" });
  }
  const scored = await computeSentimentForArticles([found]);
  const score = scored[0].scores;
  res.json({
    articleId: found.id,
    title: found.title,
    sentimentScore: Number(score.compound.toFixed(4)),
    sentimentLabel: labelForCompound(score.compound),
    publishedAt: found.publishedAt,
  });
};

export const getSentiment = async (req: Request, res: Response) => {
  const keyword = String(req.query.keyword || "").trim();
  if (!keyword) {
    return res.status(400).json({ code: 400, message: "keyword required" });
  }
  const sourceId = String(req.query.sourceId || "").trim() || undefined;
  const timeframe = parseTimeframe(String(req.query.timeframe || "").trim(), "7d");
  if (!timeframe) {
    return res.status(400).json({ code: 400, message: "Invalid timeframe parameter" });
  }

  const matched = filterArticlesByTimeframe(
    await searchArticles(keyword, sourceId),
    timeframe,
  );
  const scored = await computeSentimentForArticles(matched);
  const distribution = { positive: 0, neutral: 0, negative: 0 };
  scored.forEach((entry) => {
    const label = labelForCompound(entry.scores.compound);
    distribution[label as keyof typeof distribution] += 1;
  });
  const avg =
    scored.reduce((sum, e) => sum + e.scores.compound, 0) / (scored.length || 1);
  res.json({
    keyword,
    sourceId,
    timeframe,
    articleCount: matched.length,
    averageSentiment: Number(avg.toFixed(4)),
    distribution,
  });
};

export const getSentimentTrend = async (req: Request, res: Response) => {
  const keyword = String(req.query.keyword || "").trim();
  if (!keyword) {
    return res.status(400).json({ code: 400, message: "keyword required" });
  }
  const sourceId = String(req.query.sourceId || "").trim() || undefined;
  const timeframe = parseTimeframe(String(req.query.timeframe || "").trim(), "7d");
  if (!timeframe) {
    return res.status(400).json({ code: 400, message: "Invalid timeframe parameter" });
  }

  const matched = filterArticlesByTimeframe(
    await searchArticles(keyword, sourceId),
    timeframe,
  );
  const scored = await computeSentimentForArticles(matched);

  const byDate = new Map<string, { compoundTotal: number; articleCount: number }>();
  for (const entry of scored) {
    const dateKey = String(entry.article.publishedAt || "").slice(0, 10);
    if (!dateKey) {
      continue;
    }
    const bucket = byDate.get(dateKey) || { compoundTotal: 0, articleCount: 0 };
    bucket.compoundTotal += entry.scores.compound;
    bucket.articleCount += 1;
    byDate.set(dateKey, bucket);
  }

  const dataPoints = Array.from(byDate.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, stats]) => ({
      date,
      averageSentiment: Number((stats.compoundTotal / stats.articleCount).toFixed(4)),
      articleCount: stats.articleCount,
    }));

  res.json({ keyword, sourceId, timeframe, dataPoints });
};

export const getTrending = async (req: Request, res: Response) => {
  const timeframe = parseTimeframe(String(req.query.timeframe || "").trim(), "24h");
  if (!timeframe) {
    return res.status(400).json({ code: 400, message: "Invalid timeframe parameter" });
  }
  const limit = parseLimit(String(req.query.limit || "10"));

  const recentArticles = filterArticlesByTimeframe(await loadCleanArticles(), timeframe);
  const trending = getTrendingKeywords(recentArticles, limit);
  res.json({ timeframe, keywords: trending });
};

export const getSources = async (req: Request, res: Response) => {
  let limit = parseInt(String(req.query.limit || "50"), 10);
  if (Number.isNaN(limit) || limit < 1) {
    limit = 50;
  }
  limit = Math.min(limit, 100);

  const timeframe = parseTimeframe(String(req.query.timeframe || "").trim(), "30d");
  if (!timeframe) {
    return res.status(400).json({ code: 400, message: "Invalid timeframe parameter" });
  }

  const recentArticles = filterArticlesByTimeframe(await loadCleanArticles(), timeframe);
  const sources = aggregateSources(recentArticles).slice(0, limit);

  res.json(
    sources.map((source) => ({
      id: source.id,
      name: source.name,
      url: source.url,
      articleCount: source.articleCount,
      latestPublishedAt: source.latestPublishedAt,
    })),
  );
};

const computeSourceSummary = async (
  keyword: string,
  sourceId: string,
  timeframe: Timeframe,
) => {
  const matched = filterArticlesByTimeframe(await searchArticles(keyword, sourceId), timeframe);
  const scored = await computeSentimentForArticles(matched);
  const avg =
    scored.reduce((sum, entry) => sum + entry.scores.compound, 0) / (scored.length || 1);

  const distribution = { positive: 0, neutral: 0, negative: 0 };
  for (const entry of scored) {
    const label = labelForCompound(entry.scores.compound);
    distribution[label as keyof typeof distribution] += 1;
  }

  return {
    keyword,
    sourceId,
    sourceName: scored[0]?.article.sourceName || sourceId,
    timeframe,
    articleCount: matched.length,
    averageSentiment: Number(avg.toFixed(4)),
    distribution,
  };
};

export const getSentimentBySource = async (req: Request, res: Response) => {
  const keyword = String(req.query.keyword || "").trim();
  const sourceId = String(req.query.sourceId || "").trim();
  if (!keyword) {
    return res.status(400).json({ code: 400, message: "keyword required" });
  }
  if (!sourceId) {
    return res.status(400).json({ code: 400, message: "sourceId required" });
  }

  const timeframe = parseTimeframe(String(req.query.timeframe || "").trim(), "7d");
  if (!timeframe) {
    return res.status(400).json({ code: 400, message: "Invalid timeframe parameter" });
  }

  const summary = await computeSourceSummary(keyword, sourceId, timeframe);
  res.json(summary);
};

export const getSentimentComparison = async (req: Request, res: Response) => {
  const keyword = String(req.query.keyword || "").trim();
  if (!keyword) {
    return res.status(400).json({ code: 400, message: "keyword required" });
  }

  const timeframe = parseTimeframe(String(req.query.timeframe || "").trim(), "7d");
  if (!timeframe) {
    return res.status(400).json({ code: 400, message: "Invalid timeframe parameter" });
  }

  const sourceIdsParam = String(req.query.sourceIds || "").trim();
  const requestedSourceIds = sourceIdsParam
    ? sourceIdsParam
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  const matched = filterArticlesByTimeframe(await searchArticles(keyword), timeframe);
  const availableSourceIds = Array.from(new Set(matched.map((a) => String(a.sourceId))));
  const sourceIds = requestedSourceIds.length ? requestedSourceIds : availableSourceIds;

  const comparisons = [];
  for (const sourceId of sourceIds) {
    comparisons.push(await computeSourceSummary(keyword, sourceId, timeframe));
  }

  res.json({
    keyword,
    timeframe,
    sourcesCompared: comparisons.length,
    comparisons: comparisons.sort((a, b) => b.averageSentiment - a.averageSentiment),
  });
};

export const getSentimentTrendChart = async (req: Request, res: Response) => {
  const keyword = String(req.query.keyword || "").trim();
  if (!keyword) {
    return res.status(400).json({ code: 400, message: "keyword required" });
  }

  const timeframe = parseTimeframe(String(req.query.timeframe || "").trim(), "7d");
  if (!timeframe) {
    return res.status(400).json({ code: 400, message: "Invalid timeframe parameter" });
  }

  const sourceId = String(req.query.sourceId || "").trim() || undefined;
  const matched = filterArticlesByTimeframe(
    await searchArticles(keyword, sourceId),
    timeframe,
  );
  const scored = await computeSentimentForArticles(matched);

  const byDate = new Map<string, { compoundTotal: number; articleCount: number }>();
  for (const entry of scored) {
    const dateKey = String(entry.article.publishedAt || "").slice(0, 10);
    if (!dateKey) continue;
    const bucket = byDate.get(dateKey) || { compoundTotal: 0, articleCount: 0 };
    bucket.compoundTotal += entry.scores.compound;
    bucket.articleCount += 1;
    byDate.set(dateKey, bucket);
  }

  const sorted = Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  const labels = sorted.map(([date]) => date);
  const sentimentData = sorted.map(([, stats]) =>
    Number((stats.compoundTotal / stats.articleCount).toFixed(4)),
  );
  const articleCountData = sorted.map(([, stats]) => stats.articleCount);

  res.json({
    chartType: "line",
    labels,
    datasets: [
      {
        label: "Average Sentiment",
        data: sentimentData,
        borderColor: "#1f77b4",
        yAxisID: "y",
      },
      {
        label: "Article Count",
        data: articleCountData,
        borderColor: "#ff7f0e",
        yAxisID: "y1",
      },
    ],
    meta: { keyword, sourceId, timeframe },
  });
};

export const getSourceComparisonChart = async (req: Request, res: Response) => {
  const keyword = String(req.query.keyword || "").trim();
  if (!keyword) {
    return res.status(400).json({ code: 400, message: "keyword required" });
  }

  const timeframe = parseTimeframe(String(req.query.timeframe || "").trim(), "7d");
  if (!timeframe) {
    return res.status(400).json({ code: 400, message: "Invalid timeframe parameter" });
  }

  const sourceIdsParam = String(req.query.sourceIds || "").trim();
  const requestedSourceIds = sourceIdsParam
    ? sourceIdsParam
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : [];

  const matched = filterArticlesByTimeframe(await searchArticles(keyword), timeframe);
  const availableSourceIds = Array.from(new Set(matched.map((a) => String(a.sourceId))));
  const sourceIds = requestedSourceIds.length ? requestedSourceIds : availableSourceIds;

  const comparisons = [];
  for (const sourceId of sourceIds) {
    comparisons.push(await computeSourceSummary(keyword, sourceId, timeframe));
  }

  const sorted = comparisons.sort((a, b) => b.averageSentiment - a.averageSentiment);

  res.json({
    chartType: "bar",
    labels: sorted.map((item) => item.sourceName),
    datasets: [
      {
        label: "Average Sentiment",
        data: sorted.map((item) => item.averageSentiment),
        backgroundColor: "#2ca02c",
      },
      {
        label: "Article Count",
        data: sorted.map((item) => item.articleCount),
        backgroundColor: "#9467bd",
      },
    ],
    meta: { keyword, timeframe },
  });
};

const KEY_HEADER = "x-api-key";

type ApiKeyStatus = "active" | "revoked";

type ApiKeyRecord = {
  keyId: string;
  key: string;
  label?: string;
  createdAt: string;
  lastUsedAt: string | null;
  status: ApiKeyStatus;
};

let activeApiKey: ApiKeyRecord | null = null;

function getApiKeyFromRequest(req: Request): string | null {
  const header = req.header(KEY_HEADER) || req.header(KEY_HEADER.toUpperCase());
  return typeof header === "string" ? header : null;
}

function validateApiKey(req: Request): ApiKeyRecord | null {
  const key = getApiKeyFromRequest(req);
  if (!key || !activeApiKey || activeApiKey.status !== "active") return null;
  if (key !== activeApiKey.key) return null;
  activeApiKey.lastUsedAt = new Date().toISOString();
  return activeApiKey;
}

export const getApiKey = async (req: Request, res: Response) => {
  const record = validateApiKey(req);
  if (!record) {
    if (activeApiKey && activeApiKey.status === "revoked") {
      return res
        .status(404)
        .json({ code: 404, message: "No active API key found for this user" });
    }
    return res.status(401).json({ code: 401, message: "Missing or invalid API key" });
  }

  res.json({
    keyId: record.keyId,
    label: record.label,
    createdAt: record.createdAt,
    lastUsedAt: record.lastUsedAt,
    status: record.status,
  });
};

export const createApiKey = async (req: Request, res: Response) => {
  if (activeApiKey && activeApiKey.status === "active") {
    return res
      .status(409)
      .json({ code: 409, message: "An active API key already exists for this user" });
  }

  const label = String(req.body?.label || "").trim() || undefined;
  const keyId = crypto.randomUUID();
  const key = crypto.randomBytes(24).toString("hex");
  const now = new Date().toISOString();
  activeApiKey = {
    keyId,
    key,
    label,
    createdAt: now,
    lastUsedAt: null,
    status: "active",
  };

  res.status(201).json({ keyId, key, label, createdAt: now });
};

export const revokeApiKey = async (req: Request, res: Response) => {
  const record = validateApiKey(req);
  if (!record) {
    if (activeApiKey && activeApiKey.status === "active") {
      return res.status(401).json({ code: 401, message: "Missing or invalid API key" });
    }
    return res
      .status(404)
      .json({ code: 404, message: "No active API key found for this user" });
  }

  record.status = "revoked";
  const revokedAt = new Date().toISOString();
  res.json({ keyId: record.keyId, revokedAt, message: "API key revoked successfully" });
};

export const getArticleVolumeTrend = async (req: Request, res: Response) => {
  const keyword = String(req.query.keyword || "").trim();
  if (!keyword) {
    return res.status(400).json({ code: 400, message: "keyword required" });
  }

  const timeframe = parseTimeframe(String(req.query.timeframe || "").trim(), "7d");
  if (!timeframe) {
    return res.status(400).json({ code: 400, message: "Invalid timeframe parameter" });
  }

  const sourceId = String(req.query.sourceId || "").trim() || undefined;
  const matched = filterArticlesByTimeframe(await searchArticles(keyword, sourceId), timeframe);

  const start = timeframeStartDate(timeframe);
  const now = new Date();

  const bucketKey = (date: Date) => {
    if (timeframe === "24h") {
      // ISO string truncated to the hour
      const d = new Date(date);
      d.setMinutes(0, 0, 0);
      return d.toISOString().replace(/\.\d{3}Z$/, "Z");
    }
    // Daily buckets
    return date.toISOString().slice(0, 10);
  };

  const bucketIncrement = (date: Date): Date => {
    const next = new Date(date);
    if (timeframe === "24h") {
      next.setHours(next.getHours() + 1);
      return next;
    }
    next.setDate(next.getDate() + 1);
    return next;
  };

  const buckets = new Map<string, number>();
  for (let cursor = new Date(start); cursor <= now; cursor = bucketIncrement(cursor)) {
    buckets.set(bucketKey(cursor), 0);
  }

  for (const article of matched) {
    const published = new Date(String(article.publishedAt || ""));
    if (Number.isNaN(published.getTime()) || published < start || published > now) {
      continue;
    }
    const key = bucketKey(published);
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }

  const dataPoints = Array.from(buckets.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, articleCount]) => ({ date, articleCount }));

  res.json({
    keyword,
    sourceId,
    timeframe,
    totalArticles: matched.length,
    dataPoints,
  });
};

