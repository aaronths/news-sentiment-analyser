import { Request, Response } from "express";
import { readCleanArticles } from "../services/data-store.service";

export const getArticlesByKeyword = async (req: Request, res: Response) => {
  const keyword = typeof req.query.keyword === "string" ? req.query.keyword.trim() : "";

  if (!keyword) {
    res.status(400).json({ message: "Query parameter 'keyword' is required." });
    return;
  }

  const sourceId = typeof req.query.sourceId === "string" ? req.query.sourceId : undefined;
  const limit =
    typeof req.query.limit === "string" ? Number.parseInt(req.query.limit, 10) : undefined;
  const normalizedKeyword = keyword.toLowerCase();
  const cleanArticles = await readCleanArticles();
  const filteredArticles = cleanArticles.filter((article) => {
    const haystack = `${article.title} ${article.body} ${article.keywordTokens.join(" ")}`.toLowerCase();
    const matchesKeyword = haystack.includes(normalizedKeyword);
    const matchesSource = sourceId ? article.sourceId === sourceId : true;
    return matchesKeyword && matchesSource;
  });

  res.json({
    keyword,
    totalMatches: filteredArticles.length,
    articles: limit && limit > 0 ? filteredArticles.slice(0, limit) : filteredArticles,
  });
};

export const getOutletSummary = async (req: Request, res: Response) => {
  const cleanArticles = await readCleanArticles();
  const byOutlet = new Map<string, { sourceId: string; sourceName: string; articleCount: number }>();

  for (const article of cleanArticles) {
    const existing = byOutlet.get(article.sourceId);

    if (existing) {
      existing.articleCount += 1;
      continue;
    }

    byOutlet.set(article.sourceId, {
      sourceId: article.sourceId,
      sourceName: article.sourceName,
      articleCount: 1,
    });
  }

  res.json({
    outlets: Array.from(byOutlet.values()).sort((left, right) => right.articleCount - left.articleCount),
  });
};


