import { Request, Response } from "express";
import { NEWS_SOURCES, isPlaceholderSecret } from "../config/news-sources";
import { appendRawArticles, readRawArticles } from "../services/data-store.service";
import { collectArticlesFromSources } from "../services/source-clients";

export const listSources = async (req: Request, res: Response) => {
  res.json({
    sources: NEWS_SOURCES.map((source) => ({
      id: source.id,
      name: source.name,
      apiKeyEnvVar: source.apiKeyEnvVar,
      apiUrlEnvVar: source.apiUrlEnvVar,
      configured: !isPlaceholderSecret(source.apiKey),
    })),
  });
};

export const collectArticles = async (req: Request, res: Response) => {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const sourceIds = Array.isArray(body.sources)
    ? body.sources.filter((value: unknown): value is string => typeof value === "string")
    : undefined;
  const requestedPerSource =
    typeof body.perSource === "number" ? body.perSource : undefined;
  const keyword = typeof body.keyword === "string" ? body.keyword : undefined;

  const { articles, sourceBreakdown } = await collectArticlesFromSources({
    sourceIds,
    perSource: requestedPerSource ?? 5,
    keyword,
  });

  const storageResult = await appendRawArticles(articles);

  res.status(201).json({
    message: "Articles collected successfully.",
    requestedKeyword: keyword ?? null,
    collectedCount: articles.length,
    storedArticleCount: storageResult.totalArticles,
    newArticles: storageResult.newArticles,
    sourceBreakdown,
    articles,
  });
};

export const getRawArticles = async (req: Request, res: Response) => {
  const sourceId = typeof req.query.sourceId === "string" ? req.query.sourceId : undefined;
  const limit =
    typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : undefined;
  const allArticles = await readRawArticles();
  const filteredArticles = sourceId
    ? allArticles.filter((article) => article.sourceId === sourceId)
    : allArticles;
  const articles = limit && limit > 0 ? filteredArticles.slice(0, limit) : filteredArticles;

  res.json({
    totalArticles: filteredArticles.length,
    articles,
  });
};
