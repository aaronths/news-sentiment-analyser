import { NewsSourceConfig } from "../types/article";

export const NEWS_SOURCES: NewsSourceConfig[] = [
  {
    id: "guardian",
    name: "The Guardian",
    provider: "guardian-search",
    apiKeyEnvVar: "GUARDIAN_API_KEY",
    apiKey: process.env.GUARDIAN_API_KEY ?? "your-guardian-api-key",
    baseUrl: "https://content.guardianapis.com",
  },
  {
    id: "nyt",
    name: "New York Times",
    provider: "nyt-top-stories",
    apiKeyEnvVar: "NYT_NEWS_API_KEY",
    apiKey: process.env.NYT_NEWS_API_KEY ?? "your-nyt-news-api-key",
    apiUrlEnvVar: "NYT_NEWS_API_URL",
    apiUrl:
      process.env.NYT_NEWS_API_URL ??
      "https://api.nytimes.com/svc/topstories/v2/home.json",
    baseUrl: "https://api.nytimes.com",
  },
];

export const isPlaceholderSecret = (value: string | undefined): boolean => {
  if (!value) {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  return (
    normalized.length === 0 ||
    normalized.startsWith("your-") ||
    normalized.includes("placeholder")
  );
};
