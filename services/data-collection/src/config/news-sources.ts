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
  {
    id: "cnn",
    name: "CNN",
    provider: "rss-feed",
    baseUrl: "https://www.cnn.com",
    rssUrlEnvVar: "CNN_NEWS_RSS_URL",
    rssUrl: process.env.CNN_NEWS_RSS_URL ?? "http://rss.cnn.com/rss/cnn_topstories.rss",
  },
  {
    id: "npr",
    name: "NPR",
    provider: "rss-feed",
    baseUrl: "https://www.npr.org",
    rssUrlEnvVar: "NPR_NEWS_RSS_URL",
    rssUrl: process.env.NPR_NEWS_RSS_URL ?? "https://www.npr.org/rss/rss.php?id=1001",
  },
  {
    id: "techcrunch",
    name: "TechCrunch",
    provider: "rss-feed",
    baseUrl: "https://techcrunch.com",
    rssUrlEnvVar: "TECHCRUNCH_RSS_URL",
    rssUrl:
      process.env.TECHCRUNCH_RSS_URL ?? "https://techcrunch.com/feed/",
  },
  {
    id: "guardian-au",
    name: "The Guardian Australia",
    provider: "rss-feed",
    baseUrl: "https://www.theguardian.com",
    rssUrlEnvVar: "GUARDIAN_AU_RSS_URL",
    rssUrl: process.env.GUARDIAN_AU_RSS_URL ?? "https://www.theguardian.com/au/rss",
  },
  {
    id: "smh",
    name: "Sydney Morning Herald",
    provider: "rss-feed",
    baseUrl: "https://www.smh.com.au",
    rssUrlEnvVar: "SMH_NEWS_RSS_URL",
    rssUrl: process.env.SMH_NEWS_RSS_URL ?? "https://www.smh.com.au/rss/feed.xml",
  },
  {
    id: "theage",
    name: "The Age",
    provider: "rss-feed",
    baseUrl: "https://www.theage.com.au",
    rssUrlEnvVar: "THEAGE_NEWS_RSS_URL",
    rssUrl: process.env.THEAGE_NEWS_RSS_URL ?? "https://www.theage.com.au/rss/feed.xml",
  },
  {
    id: "ninetynine",
    name: "9News",
    provider: "rss-feed",
    baseUrl: "https://www.9news.com.au",
    rssUrlEnvVar: "NINE_NEWS_RSS_URL",
    rssUrl: process.env.NINE_NEWS_RSS_URL ?? "https://www.9news.com.au/rss",
  },
  {
    id: "theaustralian",
    name: "The Australian",
    provider: "rss-feed",
    baseUrl: "https://www.theaustralian.com.au",
    rssUrlEnvVar: "THE_AUSTRALIAN_RSS_URL",
    rssUrl: process.env.THE_AUSTRALIAN_RSS_URL ?? "https://www.theaustralian.com.au/rss",
  },
  {
    id: "heraldsun",
    name: "Herald Sun",
    provider: "rss-feed",
    baseUrl: "https://www.heraldsun.com.au",
    rssUrlEnvVar: "HERALD_SUN_RSS_URL",
    rssUrl: process.env.HERALD_SUN_RSS_URL ?? "https://www.heraldsun.com.au/news/national/rss",
  },
  {
    id: "skynews-au",
    name: "Sky News Australia",
    provider: "rss-feed",
    baseUrl: "https://www.skynews.com.au",
    rssUrlEnvVar: "SKYNEWS_AU_RSS_URL",
    rssUrl: process.env.SKYNEWS_AU_RSS_URL ?? "https://www.skynews.com.au/rss/article.xml",
  },
  {
    id: "theconversation",
    name: "The Conversation (AU)",
    provider: "rss-feed",
    baseUrl: "https://theconversation.com",
    rssUrlEnvVar: "THE_CONVERSATION_RSS_URL",
    rssUrl: process.env.THE_CONVERSATION_RSS_URL ?? "https://theconversation.com/au/articles.rss",
  },
  {
    id: "afr",
    name: "Australian Financial Review",
    provider: "rss-feed",
    baseUrl: "https://www.afr.com",
    rssUrlEnvVar: "AFR_RSS_URL",
    rssUrl: process.env.AFR_RSS_URL ?? "https://www.afr.com/rss",
  },
  {
    id: "aljazeera",
    name: "Al Jazeera",
    provider: "rss-feed",
    baseUrl: "https://www.aljazeera.com",
    rssUrlEnvVar: "ALJAZEERA_RSS_URL",
    rssUrl: process.env.ALJAZEERA_RSS_URL ?? "https://www.aljazeera.com/xml/rss/all.xml",
  },
  {
    id: "guardian-us",
    name: "The Guardian (US)",
    provider: "rss-feed",
    baseUrl: "https://www.theguardian.com",
    rssUrlEnvVar: "GUARDIAN_US_RSS_URL",
    rssUrl: process.env.GUARDIAN_US_RSS_URL ?? "https://www.theguardian.com/us/rss",
  },
  {
    id: "washingtonpost",
    name: "Washington Post",
    provider: "rss-feed",
    baseUrl: "https://www.washingtonpost.com",
    rssUrlEnvVar: "WP_RSS_URL",
    rssUrl: process.env.WP_RSS_URL ?? "http://feeds.washingtonpost.com/rss/rss_election-2012",
  },
  {
    id: "financialtimes",
    name: "Financial Times",
    provider: "rss-feed",
    baseUrl: "https://www.ft.com",
    rssUrlEnvVar: "FT_RSS_URL",
    rssUrl: process.env.FT_RSS_URL ?? "https://www.ft.com/?format=rss",
  },
  {
    id: "ap",
    name: "Associated Press",
    provider: "rss-feed",
    baseUrl: "https://apnews.com",
    rssUrlEnvVar: "AP_RSS_URL",
    rssUrl: process.env.AP_RSS_URL ?? "https://apnews.com/hub/ap-top-news/rss",
  },
  {
    id: "bloomberg",
    name: "Bloomberg",
    provider: "rss-feed",
    baseUrl: "https://www.bloomberg.com",
    rssUrlEnvVar: "BLOOMBERG_RSS_URL",
    rssUrl: process.env.BLOOMBERG_RSS_URL ?? "https://www.bloomberg.com/feed/podcast/etf-report.xml",
  },
  {
    id: "lemonde",
    name: "Le Monde",
    provider: "rss-feed",
    baseUrl: "https://www.lemonde.fr",
    rssUrlEnvVar: "LEMONDE_RSS_URL",
    rssUrl: process.env.LEMONDE_RSS_URL ?? "https://www.lemonde.fr/rss/une.xml",
  },
  {
    id: "spiegel",
    name: "Der Spiegel",
    provider: "rss-feed",
    baseUrl: "https://www.spiegel.de",
    rssUrlEnvVar: "SPIEGEL_RSS_URL",
    rssUrl: process.env.SPIEGEL_RSS_URL ?? "https://www.spiegel.de/schlagzeilen/tops/index.rss",
  },
  {
    id: "elpais",
    name: "El País",
    provider: "rss-feed",
    baseUrl: "https://elpais.com",
    rssUrlEnvVar: "ELPAIS_RSS_URL",
    rssUrl: process.env.ELPAIS_RSS_URL ?? "https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada",
  },
  {
    id: "scmp",
    name: "South China Morning Post",
    provider: "rss-feed",
    baseUrl: "https://www.scmp.com",
    rssUrlEnvVar: "SCMP_RSS_URL",
    rssUrl: process.env.SCMP_RSS_URL ?? "https://www.scmp.com/rss/asia-briefing-news/rss.xml",
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
