export interface CleanArticle {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  body: string;
  summary: string;
  publishedAt: string;
  collectedAt: string;
  url: string;
  keywordTokens: string[];
  sentimentText: string;
}
