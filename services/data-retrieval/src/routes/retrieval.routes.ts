import { Router } from "express";
import {
  performTest,
  getArticles,
  getArticleMetadata,
  getArticleById,
  getArticleSentiment,
  getSentiment,
  getSentimentBySource,
  getSentimentComparison,
  getSentimentTrend,
  getSentimentTrendChart,
  getMonthlyMentionsBySourceChart,
  getMonthlyMentionsBySourceChartImage,
  getSourceComparisonChart,
  getTrending,
  getSources,
} from "../controllers/retrieval.controller";
import {
  getDistributionChartData,
  getDistributionChartImage,
  getRankingsChartData,
  getRankingsChartImage,
} from "../controllers/charts.controller";

export const retrievalRouter = Router();

// keep the old test endpoint for compatibility
retrievalRouter.get("/test", performTest);

// swagger-defined routes
retrievalRouter.get("/articles", getArticles);
retrievalRouter.get("/articles/metadata", getArticleMetadata);
retrievalRouter.get("/charts/rankings", getRankingsChartData);
retrievalRouter.get("/charts/rankings.png", getRankingsChartImage);
retrievalRouter.get("/charts/distribution", getDistributionChartData);
retrievalRouter.get("/charts/distribution.png", getDistributionChartImage);
// sentiment endpoint must come **before** the generic id route, otherwise the
// latter swallows requests by greedily matching the trailing "/sentiment".
retrievalRouter.get("/articles/:id(*)/sentiment", getArticleSentiment);
// IDs may contain slashes (they’re derived from Guardian URLs), so capture the
// entire remainder of the path. express 4+ allows `(*)` for this purpose.
retrievalRouter.get("/articles/:id(*)", getArticleById);
retrievalRouter.get("/sentiment", getSentiment);
retrievalRouter.get("/sentiment/source", getSentimentBySource);
retrievalRouter.get("/sentiment/compare", getSentimentComparison);
retrievalRouter.get("/sentiment/trend", getSentimentTrend);
retrievalRouter.get("/trending", getTrending);
retrievalRouter.get("/sources", getSources);
retrievalRouter.get("/chart/sentiment/trend", getSentimentTrendChart);
retrievalRouter.get("/chart/sources/compare", getSourceComparisonChart);
retrievalRouter.get("/chart/mentions/monthly", getMonthlyMentionsBySourceChart);
retrievalRouter.get("/chart/mentions/monthly.png", getMonthlyMentionsBySourceChartImage);