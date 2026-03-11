import { Request, Response } from "express";

/*
 * The controllers below correspond to the OpenAPI definitions in
 * `src/swagger/swagger.yaml`. For now they return simple stubbed
 * responses (empty arrays, error codes) so that the endpoints exist and
 * can be exercised by consumers or future tests. The service is expected
 * to evolve toward reading a real data store or delegating to the
 * Python runtime implementation.
 */

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

  // pagination / filtering parameters are currently ignored; return empty
  return res.json([]);
};

export const getArticleMetadata = async (req: Request, res: Response) => {
  const keyword = String(req.query.keyword || "").trim();
  if (!keyword) {
    return res.status(400).json({ code: 400, message: "keyword required" });
  }

  return res.json([]);
};

export const getArticleById = async (req: Request, res: Response) => {
  const { id } = req.params as { id?: string };
  if (!id) {
    return res.status(400).json({ code: 400, message: "id path parameter required" });
  }

  // nothing stored yet
  return res.status(404).json({ code: 404, message: "Article could not be found (invalid article id)" });
};

export const getArticleSentiment = async (req: Request, res: Response) => {
  const { id } = req.params as { id?: string };
  if (!id) {
    return res.status(400).json({ code: 400, message: "id path parameter required" });
  }

  return res.status(404).json({ code: 404, message: "Article could not be found (invalid article id)" });
};

export const getSentiment = async (req: Request, res: Response) => {
  const keyword = String(req.query.keyword || "").trim();
  if (!keyword) {
    return res.status(400).json({ code: 400, message: "keyword required" });
  }

  return res.json({
    keyword,
    articleCount: 0,
    averageSentiment: 0,
    distribution: { positive: 0, neutral: 0, negative: 0 },
  });
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

  return res.json({
    keyword,
    timeframe,
    dataPoints: [],
  });
};

export const getTrending = async (req: Request, res: Response) => {
  const timeframe = String(req.query.timeframe || "24h");
  const allowed = ["24h", "7d", "30d"];
  if (timeframe && !allowed.includes(timeframe)) {
    return res.status(401).json({ code: 401, message: "Invalid timeframe parameter" });
  }

  return res.json([]);
};

export const getSources = async (req: Request, res: Response) => {
  let limit = parseInt(String(req.query.limit || ""), 10);
  if (isNaN(limit) || limit < 1) {
    limit = 50;
  }

  return res.json([]);
};

