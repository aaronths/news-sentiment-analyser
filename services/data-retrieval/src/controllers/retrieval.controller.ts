import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import type { ChartConfiguration } from "chart.js";
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
  parsePaginationParams,
  createPaginatedResult,
} from "../services/articles.service";
import { parseChartDimension, renderChartToPng } from "../services/charts.service";
import { logger } from "../utils/logger";

const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const CHART_COLORS = [
  "#1f77b4",
  "#ff7f0e",
  "#2ca02c",
  "#d62728",
  "#9467bd",
  "#8c564b",
  "#e377c2",
  "#7f7f7f",
  "#bcbd22",
  "#17becf",
];

function validateRequiredString(value: unknown, fieldName: string): string {
  const str = String(value || "").trim();
  if (!str) {
    throw new Error(`${fieldName} is required`);
  }
  return str;
}

function validateOptionalString(value: unknown): string | undefined {
  const str = String(value || "").trim();
  return str || undefined;
}

function handleValidationError(res: Response, error: Error): void {
  res.status(400).json({ code: 400, message: error.message });
}

function handleNotFound(res: Response, message: string): void {
  res.status(404).json({ code: 404, message });
}

function handleSuccess(res: Response, data: unknown, statusCode = 200): void {
  res.status(statusCode).json(data);
}

function handleNoContent(res: Response): void {
  res.status(204).send();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function titleContainsKeyword(title: string, keyword: string): boolean {
  const normalizedTitle = String(title || "");
  const normalizedKeyword = String(keyword || "").trim();
  if (!normalizedKeyword) {
    return false;
  }

  if (normalizedKeyword.includes(" ")) {
    return normalizedTitle.toLowerCase().includes(normalizedKeyword.toLowerCase());
  }

  const pattern = new RegExp(`\\b${escapeRegExp(normalizedKeyword)}\\b`, "i");
  return pattern.test(normalizedTitle);
}

function parseYear(raw: string | undefined, fallback: number): number | null {
  const normalized = String(raw || "").trim();
  if (!normalized) {
    return fallback;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (Number.isNaN(parsed) || parsed < 2000 || parsed > 2100) {
    return null;
  }
  return parsed;
}

function parseSourceLimit(raw: string | undefined, fallback: number): number {
  const normalized = String(raw || "").trim();
  if (!normalized) {
    return fallback;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, 1), 20);
}

type MonthlyMentionsDataset = {
  label: string;
  data: number[];
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
};

type MonthlyMentionsChartPayload = {
  chartType: "bar";
  labels: string[];
  datasets: MonthlyMentionsDataset[];
  meta: {
    keyword: string;
    year: number;
    sourceLimit: number;
    sourcesCompared: number;
    totalMentions: number;
  };
};

async function buildMonthlyMentionsBySourceChartPayload(
  keyword: string,
  year: number,
  sourceLimit: number,
): Promise<MonthlyMentionsChartPayload> {
  const articles = await loadCleanArticles();

  const bySource = new Map<
    string,
    {
      sourceName: string;
      monthlyCounts: number[];
      totalMentions: number;
    }
  >();

  for (const article of articles) {
    const title = String(article.title || "");
    if (!titleContainsKeyword(title, keyword)) {
      continue;
    }

    const publishedAt = new Date(String(article.publishedAt || ""));
    if (Number.isNaN(publishedAt.getTime()) || publishedAt.getUTCFullYear() !== year) {
      continue;
    }

    const sourceId = String(article.sourceId || "unknown").trim() || "unknown";
    const sourceName = String(article.sourceName || sourceId || "Unknown");
    const monthIndex = publishedAt.getUTCMonth();
    const bucket = bySource.get(sourceId) || {
      sourceName,
      monthlyCounts: new Array(12).fill(0),
      totalMentions: 0,
    };

    bucket.monthlyCounts[monthIndex] += 1;
    bucket.totalMentions += 1;
    bySource.set(sourceId, bucket);
  }

  const rankedSources = Array.from(bySource.entries())
    .sort((a, b) => b[1].totalMentions - a[1].totalMentions)
    .slice(0, sourceLimit);

  const datasets = rankedSources.map(([, bucket], index) => ({
    label: bucket.sourceName,
    data: bucket.monthlyCounts,
    backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
    borderColor: "#1f2937",
    borderWidth: 1,
  }));

  const totalMentions = rankedSources.reduce((sum, [, bucket]) => sum + bucket.totalMentions, 0);

  return {
    chartType: "bar",
    labels: MONTH_LABELS,
    datasets,
    meta: {
      keyword,
      year,
      sourceLimit,
      sourcesCompared: datasets.length,
      totalMentions,
    },
  };
}

// health/test helper that's kept for backwards compatibility
export const performTest = async (req: Request, res: Response) => {
  logger.info("Health check successful");
  res.json({ success: true });
};

// /api/articles?keyword=...&limit=&startDate=&endDate=&page=&limit=
export const getArticles = async (req: Request, res: Response) => {
  try {
    const keyword = validateRequiredString(req.query.keyword, "keyword");
    const sourceId = validateOptionalString(req.query.sourceId);
    const startDate = validateOptionalString(req.query.startDate);
    const endDate = validateOptionalString(req.query.endDate);
    const { page, limit } = parsePaginationParams(req.query);

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

    const paginatedArticles = createPaginatedResult(topArticles, page || 1, limit || 20, scored.length);

    // add logging
    logger.info("Successfully fetched articles", { 
      keyword, 
      sourceId, 
      totalMatches: matched.length,
      returnedCount: topArticles.length 
    });

    handleSuccess(res, {
      keyword,
      totalMatches: matched.length,
      rankings,
      articles: paginatedArticles,
      self: `?keyword=${encodeURIComponent(keyword)}&sourceId=${encodeURIComponent(
        sourceId || ""
      )}&limit=${limit}&startDate=${encodeURIComponent(
        startDate || ""
      )}&endDate=${encodeURIComponent(endDate || "")}&page=${page}`,
    });
  } catch (error) {

    // error log
    logger.error("Failed to fetch articles", error, { 
      keyword: req.query.keyword,
      sourceId: req.query.sourceId 
    });

    if (error instanceof Error) {
      handleValidationError(res, error);
    } else {
      res.status(500).json({ code: 500, message: "Internal server error" });
    }
  }
};

export const getArticleMetadata = async (req: Request, res: Response) => {
  try {
    const keyword = validateRequiredString(req.query.keyword, "keyword");
    const { page, limit } = parsePaginationParams(req.query);

    const matched = await searchArticles(keyword);
    const metadata = matched.map((a) => ({
      id: a.id,
      title: a.title,
      author: a.author,
      source: a.sourceName,
      publishedAt: a.publishedAt,
    }));
    
    const paginatedMetadata = createPaginatedResult(metadata, page || 1, limit || 20, matched.length);

    logger.info("Successfully fetched article metadata", {
      keyword,
      totalMatches: matched.length,
      returnedCount: paginatedMetadata.data.length,
      page,
      limit,
    });

    handleSuccess(res, paginatedMetadata);
  } catch (error) {
    logger.error("Failed to fetch article metadata", error, {
      keyword: req.query.keyword,
      page: req.query.page,
      limit: req.query.limit,
    });

    if (error instanceof Error) {
      handleValidationError(res, error);
    } else {
      res.status(500).json({ code: 500, message: "Internal server error" });
    }
  }
};

export const getArticleById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id?: string };
    if (!id) {
      throw new Error("id path parameter required");
    }

    const articles = await searchArticles("");
    const found = articles.find((a) => String(a.id) === id);
    if (!found) {
      logger.info("Article lookup failed - Not Found", { requestedId: id });
      return handleNotFound(res, "Article could not be found (invalid article id)");
    }
    logger.info("Successfully fetched article by ID", { articleId: id });
    handleSuccess(res, found);
  } catch (error) {
    logger.error("Error during article ID lookup", error, { requestedId: req.params.id });
    if (error instanceof Error) {
      handleValidationError(res, error);
    } else {
      res.status(500).json({ code: 500, message: "Internal server error" });
    }
  }
};


export const getArticleSentiment = async (req: Request, res: Response) => {
  try {
    const { id } = req.params as { id?: string };
    if (!id) {
      throw new Error("id path parameter required");
    }
    const articles = await searchArticles("");
    const found = articles.find((a) => String(a.id) === id);
    if (!found) {
      logger.info("Article sentiment lookup failed - Not Found", { requestedId: id });
      return handleNotFound(res, "Article could not be found (invalid article id)");
    }
    const scored = await computeSentimentForArticles([found]);
    const score = scored[0].scores;

    logger.info("Successfully fetched article sentiment", {
      articleId: found.id,
      sentimentLabel: labelForCompound(score.compound),
    });

    handleSuccess(res, {
      articleId: found.id,
      title: found.title,
      sentimentScore: Number(score.compound.toFixed(4)),
      sentimentLabel: labelForCompound(score.compound),
      publishedAt: found.publishedAt,
    });
  } catch (error) {
    logger.error("Failed to fetch article sentiment", error, { requestedId: req.params.id });

    if (error instanceof Error) {
      handleValidationError(res, error);
    } else {
      res.status(500).json({ code: 500, message: "Internal server error" });
    }
  }
};

export const getSentiment = async (req: Request, res: Response) => {
  try {
    const keyword = validateRequiredString(req.query.keyword, "keyword");
    const sourceId = validateOptionalString(req.query.sourceId);
    const timeframe = parseTimeframe(String(req.query.timeframe || "").trim(), "7d");
    if (!timeframe) {
      throw new Error("Invalid timeframe parameter");
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

    logger.info("Successfully fetched sentiment summary", {
      keyword,
      sourceId,
      timeframe,
      articleCount: matched.length,
      averageSentiment: Number(avg.toFixed(4)),
    });

    handleSuccess(res, {
      keyword,
      sourceId,
      timeframe,
      articleCount: matched.length,
      averageSentiment: Number(avg.toFixed(4)),
      distribution,
    });
  } catch (error) {
    logger.error("Failed to fetch sentiment summary", error, {
      keyword: req.query.keyword,
      sourceId: req.query.sourceId,
      timeframe: req.query.timeframe,
    });

    if (error instanceof Error) {
      handleValidationError(res, error);
    } else {
      res.status(500).json({ code: 500, message: "Internal server error" });
    }
  }
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

  logger.info("Successfully fetched sentiment trend", {
    keyword,
    sourceId,
    timeframe,
    articleCount: matched.length,
    pointCount: dataPoints.length,
  });

  res.json({ keyword, sourceId, timeframe, dataPoints });
};

export const getTrending = async (req: Request, res: Response) => {
  try {
    const timeframe = parseTimeframe(String(req.query.timeframe || "").trim(), "24h");
    if (!timeframe) {
      throw new Error("Invalid timeframe parameter");
    }
    const limit = parseLimit(String(req.query.limit || "10"));

    const recentArticles = filterArticlesByTimeframe(await loadCleanArticles(), timeframe);
    const trending = getTrendingKeywords(recentArticles, limit);

    logger.info("Successfully fetched trending keywords", {
      timeframe,
      requestedLimit: limit,
      returnedCount: trending.length,
      articleCount: recentArticles.length,
    });

    handleSuccess(res, { timeframe, keywords: trending });
  } catch (error) {
    logger.error("Failed to fetch trending keywords", error, {
      timeframe: req.query.timeframe,
      limit: req.query.limit,
    });

    if (error instanceof Error) {
      handleValidationError(res, error);
    } else {
      res.status(500).json({ code: 500, message: "Internal server error" });
    }
  }
};

export const getSources = async (req: Request, res: Response) => {
  try {
    const { page, limit } = parsePaginationParams(req.query);
    const timeframe = parseTimeframe(String(req.query.timeframe || "").trim(), "30d");
    if (!timeframe) {
      throw new Error("Invalid timeframe parameter");
    }

    const recentArticles = filterArticlesByTimeframe(await loadCleanArticles(), timeframe);
    const sources = aggregateSources(recentArticles);

    const paginatedSources = createPaginatedResult(sources, page || 1, limit || 20, sources.length);

    logger.info("Successfully fetched sources", {
      timeframe,
      totalSources: sources.length,
      returnedCount: paginatedSources.data.length,
      page,
      limit,
    });

    handleSuccess(res, {
      ...paginatedSources,
      data: paginatedSources.data.map((source) => ({
        id: source.id,
        name: source.name,
        url: source.url,
        articleCount: source.articleCount,
        latestPublishedAt: source.latestPublishedAt,
      })),
    });
  } catch (error) {
    logger.error("Failed to fetch sources", error, {
      timeframe: req.query.timeframe,
      page: req.query.page,
      limit: req.query.limit,
    });

    if (error instanceof Error) {
      handleValidationError(res, error);
    } else {
      res.status(500).json({ code: 500, message: "Internal server error" });
    }
  }
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

  logger.info("Successfully fetched sentiment by source", {
    keyword,
    sourceId,
    timeframe,
    articleCount: summary.articleCount,
    averageSentiment: summary.averageSentiment,
  });
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

  logger.info("Successfully fetched sentiment comparison", {
    keyword,
    timeframe,
    requestedSourceCount: requestedSourceIds.length,
    comparedSourceCount: comparisons.length,
  });

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

export const getMonthlyMentionsBySourceChart = async (req: Request, res: Response) => {
  const keyword = String(req.query.keyword || "").trim();
  if (!keyword) {
    return res.status(400).json({ code: 400, message: "keyword required" });
  }

  const year = parseYear(String(req.query.year || ""), new Date().getUTCFullYear());
  if (!year) {
    return res.status(400).json({ code: 400, message: "Invalid year parameter" });
  }

  const sourceLimit = parseSourceLimit(String(req.query.sourceLimit || ""), 6);
  const chartPayload = await buildMonthlyMentionsBySourceChartPayload(keyword, year, sourceLimit);

  res.json(chartPayload);
};

export const getMonthlyMentionsBySourceChartImage = async (req: Request, res: Response) => {
  try {
    const keyword = validateRequiredString(req.query.keyword, "keyword");
    const year = parseYear(String(req.query.year || ""), new Date().getUTCFullYear());
    if (!year) {
      throw new Error("Invalid year parameter");
    }

    const sourceLimit = parseSourceLimit(String(req.query.sourceLimit || ""), 6);
    const width = parseChartDimension(String(req.query.width || ""), 1400, 400, 2600);
    const height = parseChartDimension(String(req.query.height || ""), 800, 300, 1600);

    const chartPayload = await buildMonthlyMentionsBySourceChartPayload(keyword, year, sourceLimit);

    const chartConfig: ChartConfiguration = {
      type: "bar",
      data: {
        labels: chartPayload.labels,
        datasets: chartPayload.datasets,
      },
      options: {
        responsive: false,
        plugins: {
          title: {
            display: true,
            text: `Monthly title mentions for \"${keyword}\" in ${year}`,
          },
          legend: {
            display: true,
            position: "bottom",
          },
        },
        scales: {
          x: {
            title: {
              display: true,
              text: "Month",
            },
          },
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: "Title mentions",
            },
          },
        },
      },
    };

    const image = await renderChartToPng(chartConfig, width, height);

    logger.info("Successfully rendered monthly mentions chart image", {
      keyword,
      year,
      sourceLimit,
      width,
      height,
      sourcesCompared: chartPayload.meta.sourcesCompared,
    });

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "no-store");
    res.send(image);
  } catch (error) {
    logger.error("Failed to render monthly mentions chart image", error, {
      keyword: req.query.keyword,
      year: req.query.year,
      sourceLimit: req.query.sourceLimit,
      width: req.query.width,
      height: req.query.height,
    });

    if (error instanceof Error) {
      handleValidationError(res, error);
    } else {
      res.status(500).json({ code: 500, message: "Internal server error" });
    }
  }
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

function resolveApiKeyRecord(req: Request): ApiKeyRecord | null {
  const key = getApiKeyFromRequest(req);
  if (!key || !activeApiKey || activeApiKey.status !== "active") return null;
  if (key !== activeApiKey.key) return null;
  activeApiKey.lastUsedAt = new Date().toISOString();
  return activeApiKey;
}

type AuthenticatedRequest = Request & { apiKeyRecord?: ApiKeyRecord };

export const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const record = resolveApiKeyRecord(req);
  if (!record) {
    if (activeApiKey && activeApiKey.status === "revoked") {
      logger.info("API key lookup failed - key revoked");
      return res
        .status(404)
        .json({ code: 404, message: "No active API key found for this user" });
    }
    logger.info("API key lookup failed - missing or invalid key");
    return res.status(401).json({ code: 401, message: "Missing or invalid API key" });
  }

  (req as AuthenticatedRequest).apiKeyRecord = record;
  next();
};

export const getApiKey = async (req: Request, res: Response) => {
  if (!activeApiKey) {
    logger.info("API key lookup failed - no active key found");
    return res.status(404).json({ code: 404, message: "No active API key found for this user" });
  }

  if (activeApiKey.status === "revoked") {
    logger.info("API key lookup failed - key revoked");
    return res.status(404).json({ code: 404, message: "No active API key found for this user" });
  }

  logger.info("Successfully fetched API key metadata", { keyId: activeApiKey.keyId, status: activeApiKey.status });

  res.json({
    keyId: activeApiKey.keyId,
    label: activeApiKey.label,
    createdAt: activeApiKey.createdAt,
    lastUsedAt: activeApiKey.lastUsedAt,
    status: activeApiKey.status,
  });
};

export const createApiKey = async (req: Request, res: Response) => {
  if (activeApiKey && activeApiKey.status === "active") {
    logger.info("Blocked API key creation - User already has active key");
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

  logger.info("Generated new API key", { 
    keyId, 
    label 
  });

  res.status(201).json({ keyId, key, label, createdAt: now });
};

export const revokeApiKey = async (req: Request, res: Response) => {
  try {
    if (!activeApiKey) {
      logger.info("API key revoke failed - no active key found");
      return handleNotFound(res, "No active API key found for this user");
    }

    if (activeApiKey.status === "revoked") {
      logger.info("API key revoke failed - key already revoked");
      return handleNotFound(res, "No active API key found for this user");
    }

    // Try to get API key from request header for validation, but don't require it
    const providedKey = getApiKeyFromRequest(req);
    if (providedKey && providedKey !== activeApiKey.key) {
      logger.info("API key revoke failed - invalid key provided");
      return res.status(401).json({ code: 401, message: "Missing or invalid API key" });
    }

    activeApiKey.status = "revoked";
    logger.info("Successfully revoked API key", { keyId: activeApiKey.keyId });
    handleNoContent(res);
  } catch (error) {
    if (error instanceof Error) {
      handleValidationError(res, error);
    } else {
      res.status(500).json({ code: 500, message: "Internal server error" });
    }
  }
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

