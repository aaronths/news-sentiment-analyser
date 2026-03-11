import { Router } from "express";
import {
  performTest,
  getArticles,
  getArticleMetadata,
  getArticleById,
  getArticleSentiment,
  getSentiment,
  getSentimentTrend,
  getTrending,
  getSources,
} from "../controllers/retrieval.controller";

export const retrievalRouter = Router();

// keep the old test endpoint for compatibility
retrievalRouter.get("/test", performTest);

// swagger-defined routes
retrievalRouter.get("/articles", getArticles);
retrievalRouter.get("/articles/metadata", getArticleMetadata);
retrievalRouter.get("/articles/:id", getArticleById);
retrievalRouter.get("/articles/:id/sentiment", getArticleSentiment);
retrievalRouter.get("/sentiment", getSentiment);
retrievalRouter.get("/sentiment/trend", getSentimentTrend);
retrievalRouter.get("/trending", getTrending);
retrievalRouter.get("/sources", getSources);