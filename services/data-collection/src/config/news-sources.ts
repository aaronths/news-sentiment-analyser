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
  {
    id: "nyt-most-popular",
    name: "New York Times - Most Popular",
    provider: "nyt-most-popular",
    apiKeyEnvVar: "NYT_NEWS_API_KEY",
    apiKey: process.env.NYT_NEWS_API_KEY ?? "your-nyt-news-api-key",
    apiUrlEnvVar: "NYT_MOST_POPULAR_API_URL",
    apiUrl:
      process.env.NYT_MOST_POPULAR_API_URL ??
      "https://api.nytimes.com/svc/mostpopular/v2/viewed/1.json",
    baseUrl: "https://api.nytimes.com",
  },
  {
    id: "bbc",
    name: "BBC News",
    provider: "rss-feed",
    baseUrl: "https://www.bbc.com",
    rssUrlEnvVar: "BBC_NEWS_RSS_URL",
    rssUrl: process.env.BBC_NEWS_RSS_URL ?? "https://feeds.bbci.co.uk/news/rss.xml",
  },
  {
    id: "reuters",
    name: "Reuters",
    provider: "rss-feed",
    baseUrl: "https://www.reuters.com",
    rssUrlEnvVar: "REUTERS_RSS_URL",
    rssUrl: process.env.REUTERS_RSS_URL ?? "https://feeds.reuters.com/reuters/topNews",
  },
  {
    id: "abc",
    name: "ABC News (AU)",
    provider: "rss-feed",
    baseUrl: "https://www.abc.net.au",
    rssUrlEnvVar: "ABC_NEWS_RSS_URL",
    rssUrl: process.env.ABC_NEWS_RSS_URL ?? "https://www.abc.net.au/news/feed/51120/rss.xml",
  },
  {
    id: "sbs",
    name: "SBS News",
    provider: "rss-feed",
    baseUrl: "https://www.sbs.com.au",
    rssUrlEnvVar: "SBS_NEWS_RSS_URL",
    rssUrl: process.env.SBS_NEWS_RSS_URL ?? "https://www.sbs.com.au/news/podcastfeeds/news.rss",
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

export const isSourceConfigured = (source: NewsSourceConfig): boolean => {
  if (source.provider === "rss-feed") {
    return !isPlaceholderSecret(source.rssUrl);
  }

  const keyOk = source.apiKey ? !isPlaceholderSecret(source.apiKey) : true;
  const urlOk = source.apiUrl ? !isPlaceholderSecret(source.apiUrl) : true;
  return keyOk && urlOk;
};
