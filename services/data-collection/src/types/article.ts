export interface RawArticle {
  id: string;
  sourceId: string;
  sourceName: string;
  headline: string;
  content: string;
  publishedAt: string;
  collectedAt: string;
  url: string;
  author?: string;
  section?: string;
}

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

export interface NewsSourceConfig {
  id: string;
  name: string;
  provider: "guardian-search" | "generic-query" | "nyt-top-stories" | "nyt-most-popular" | "rss-feed";
  apiKeyEnvVar?: string;
  apiKey?: string;
  baseUrl: string;
  apiUrlEnvVar?: string;
  apiUrl?: string;
  rssUrlEnvVar?: string;
  rssUrl?: string;
}

export interface SourceCollectionResult {
  sourceId: string;
  sourceName: string;
  articlesCollected: number;
  mode: "live" | "sample";
  note?: string;
}

export interface S3UploadResult {
  bucket: string;
  key: string;
  uploaded: boolean;
  location?: string;
  note?: string;
}

export interface IngestionSummary {
  startedAt: string;
  finishedAt: string;
  collectedCount: number;
  cleanCount: number;
  rawStorageCount: number;
  cleanStorageCount: number;
  sourceBreakdown: SourceCollectionResult[];
  uploads: {
    raw: S3UploadResult;
    clean: S3UploadResult;
  };
}
