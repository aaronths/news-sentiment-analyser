import { Request, Response } from "express";
import {
  searchArticles,
  computeSentimentForArticles,
  parseLimit,
  labelForCompound,
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

  const matched = await searchArticles(keyword, sourceId);

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
    )}&limit=${limit}`,
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
  const matched = await searchArticles(keyword);
  const scored = await computeSentimentForArticles(matched);
  const distribution = { positive: 0, neutral: 0, negative: 0 };
  scored.forEach((entry) => {
    const label = labelForCompound(entry.scores.compound);
    distribution[label as keyof typeof distribution] += 1;
  });
  const avg =
    scored.reduce((sum, e) => sum + e.scores.compound, 0) / (scored.length || 1);
  res.json({ keyword, articleCount: matched.length, averageSentiment: avg, distribution });
};

export const getSentimentTrend = async (req: Request, res: Response) => {
  const keyword = String(req.query.keyword || "").trim();
  if (!keyword) {
    return res.status(400).json({ code: 400, message: "keyword required" });
  }
  const timeframe = String(req.query.timeframe || "7d");
  const allowed = ["24h", "7d", "30d"];
  if (timeframe && !allowed.includes(timeframe)) {
    return res.status(401).json({ code: 401, message: "Invalid timeframe parameter" });
  }

  // rudimentary stub: always return empty dataPoints for now
  res.json({ keyword, timeframe, dataPoints: [] });
};

export const getTrending = async (req: Request, res: Response) => {
  const timeframe = String(req.query.timeframe || "24h");
  const allowed = ["24h", "7d", "30d"];
  if (timeframe && !allowed.includes(timeframe)) {
    return res.status(401).json({ code: 401, message: "Invalid timeframe parameter" });
  }
  res.json([]);
};

export const getSources = async (req: Request, res: Response) => {
  let limit = parseInt(String(req.query.limit || ""), 10);
  if (isNaN(limit) || limit < 1) {
    limit = 50;
  }

  // no real source index yet
  res.json([]);
};

