import https from "https";
import { URL } from "url";
import { XMLParser } from "fast-xml-parser";
import { NEWS_SOURCES, isPlaceholderSecret, isSourceConfigured } from "../config/news-sources";
import {
  NewsSourceConfig,
  RawArticle,
  SourceCollectionResult,
} from "../types/article";

interface CollectArticlesOptions {
  keyword?: string;
  perSource: number;
  sourceIds?: string[];
  /**
   * Number of pages to request for each source (if supported).
   *
   * For example, the Guardian API supports pagination via a `page` query
   * parameter. If set to >1, we will request further pages to gather older
   * stories in addition to the latest articles.
   */
  pages?: number;
}

interface GuardianApiResponse {
  response?: {
    results?: Array<{
      id?: string;
      webTitle?: string;
      webUrl?: string;
      webPublicationDate?: string;
      sectionName?: string;
      fields?: {
        headline?: string;
        bodyText?: string;
        trailText?: string;
        byline?: string;
      };
    }>;
  };
}

interface GenericNewsItem {
  id?: string;
  title?: string;
  content?: string;
  description?: string;
  publishedAt?: string;
  url?: string;
  author?: string;
  category?: string;
}

interface GenericNewsApiResponse {
  articles?: GenericNewsItem[];
  results?: GenericNewsItem[];
}

interface NytTopStoriesResponse {
  results?: Array<{
    title?: string;
    abstract?: string;
    published_date?: string;
    url?: string;
    byline?: string;
    section?: string;
    subsection?: string;
    short_url?: string;
    uri?: string;
  }>;
}

interface NytMostPopularResponse {
  results?: Array<{
    title?: string;
    abstract?: string;
    published_date?: string;
    url?: string;
    byline?: string;
    section?: string;
    subsection?: string;
    uri?: string;
  }>;
}

interface RssChannelItem {
  guid?: string | { "#text"?: string };
  title?: string;
  description?: string;
  "content:encoded"?: string;
  pubDate?: string;
  link?: string;
}

interface AtomEntry {
  id?: string;
  title?: string | { "#text"?: string };
  summary?: string | { "#text"?: string };
  updated?: string;
  published?: string;
  link?: { href?: string } | Array<{ href?: string }>;
}

// Default number of articles to request per source when not specified.
// RSS feeds typically publish a limited number of items per feed; increasing
// this helps capture more items from sources that provide large daily updates.
//
// NOTE: Some RSS feeds publish 100+ items, so we set a higher default to reduce
// the need for explicit per-source tuning.
const MAX_DEFAULT_PER_SOURCE = 100;

const sampleArticlesBySource: Record<string, RawArticle[]> = {
  guardian: [
    {
      id: "guardian-sample-election-1",
      sourceId: "guardian",
      sourceName: "The Guardian",
      headline: "Election promises focus on housing affordability",
      content:
        "The Guardian sample article tracks how party leaders are framing housing affordability, interest rates, and renter relief ahead of the next election campaign.",
      publishedAt: "2026-03-05T09:00:00.000Z",
      collectedAt: new Date().toISOString(),
      url: "https://www.theguardian.com/sample/election-housing",
      author: "Guardian Politics Desk",
      section: "Politics",
    },
    {
      id: "guardian-sample-climate-1",
      sourceId: "guardian",
      sourceName: "The Guardian",
      headline: "Climate investment plans expand across regional Australia",
      content:
        "A long-form sample piece covering climate investment, renewable infrastructure, and regional job growth with an overall optimistic framing.",
      publishedAt: "2026-03-04T07:15:00.000Z",
      collectedAt: new Date().toISOString(),
      url: "https://www.theguardian.com/sample/climate-investment",
      author: "Guardian Climate Team",
      section: "Environment",
    },
  ],
  abc: [
    {
      id: "abc-sample-election-1",
      sourceId: "abc",
      sourceName: "ABC News",
      headline: "Election debate centres on healthcare funding pressures",
      content:
        "ABC sample coverage summarises the policy debate on hospital demand, GP access, and budget trade-offs as the election narrative intensifies.",
      publishedAt: "2026-03-05T06:30:00.000Z",
      collectedAt: new Date().toISOString(),
      url: "https://www.abc.net.au/news/sample/election-healthcare",
      author: "ABC Newsroom",
      section: "National",
    },
    {
      id: "abc-sample-cost-of-living-1",
      sourceId: "abc",
      sourceName: "ABC News",
      headline: "Cost-of-living pressures remain top concern for households",
      content:
        "Sample ABC reporting notes a more cautious tone around inflation, wage growth, and consumer confidence in major cities.",
      publishedAt: "2026-03-03T11:45:00.000Z",
      collectedAt: new Date().toISOString(),
      url: "https://www.abc.net.au/news/sample/cost-of-living",
      author: "ABC Business Reporter",
      section: "Business",
    },
  ],
  sbs: [
    {
      id: "sbs-sample-election-1",
      sourceId: "sbs",
      sourceName: "SBS News",
      headline: "Election messaging highlights multicultural community priorities",
      content:
        "SBS sample coverage focuses on how multicultural communities are responding to campaign promises involving migration, jobs, and public services.",
      publishedAt: "2026-03-05T08:20:00.000Z",
      collectedAt: new Date().toISOString(),
      url: "https://www.sbs.com.au/news/sample/election-community",
      author: "SBS News Team",
      section: "Australia",
    },
    {
      id: "sbs-sample-climate-1",
      sourceId: "sbs",
      sourceName: "SBS News",
      headline: "Climate resilience funding welcomed by local councils",
      content:
        "An upbeat sample article on climate resilience funding, adaptation planning, and community-led flood preparation programs.",
      publishedAt: "2026-03-02T14:00:00.000Z",
      collectedAt: new Date().toISOString(),
      url: "https://www.sbs.com.au/news/sample/climate-resilience",
      author: "SBS Environment Correspondent",
      section: "Environment",
    },
  ],
  nyt: [
    {
      id: "nyt-sample-global-1",
      sourceId: "nyt",
      sourceName: "New York Times",
      headline: "Global markets steady as investors assess inflation signals",
      content:
        "A sample New York Times-style briefing on global markets, interest rate expectations, and investor sentiment across major economies.",
      publishedAt: "2026-03-05T12:00:00.000Z",
      collectedAt: new Date().toISOString(),
      url: "https://www.nytimes.com/sample/global-markets",
      author: "The New York Times",
      section: "Business",
    },
    {
      id: "nyt-sample-climate-1",
      sourceId: "nyt",
      sourceName: "New York Times",
      headline: "Cities expand climate adaptation plans after severe weather",
      content:
        "A sample New York Times article on municipal climate adaptation, resilience planning, and infrastructure funding.",
      publishedAt: "2026-03-04T10:30:00.000Z",
      collectedAt: new Date().toISOString(),
      url: "https://www.nytimes.com/sample/climate-adaptation",
      author: "The New York Times",
      section: "Climate",
    },
  ],
  "nyt-most-popular": [
    {
      id: "nyt-most-popular-sample-1",
      sourceId: "nyt-most-popular",
      sourceName: "New York Times - Most Popular",
      headline: "Most-read: Economic outlook remains mixed across major cities",
      content:
        "A sample most-popular article capturing broad reader interest in inflation, wages, and housing costs.",
      publishedAt: "2026-03-05T12:00:00.000Z",
      collectedAt: new Date().toISOString(),
      url: "https://www.nytimes.com/sample/most-popular-economy",
      author: "The New York Times",
      section: "Business",
    },
  ],
  bbc: [
    {
      id: "bbc-sample-world-1",
      sourceId: "bbc",
      sourceName: "BBC News",
      headline: "Global policy shifts keep markets on edge",
      content:
        "Sample BBC-style world desk reporting on macroeconomic policy updates and investor response.",
      publishedAt: "2026-03-06T08:30:00.000Z",
      collectedAt: new Date().toISOString(),
      url: "https://www.bbc.com/news/sample/world-markets",
      author: "BBC World Service",
      section: "World",
    },
  ],
  reuters: [
    {
      id: "reuters-sample-global-1",
      sourceId: "reuters",
      sourceName: "Reuters",
      headline: "Global growth expectations revised amid policy uncertainty",
      content:
        "Sample Reuters-style dispatch tracking global growth, commodities, and central bank guidance.",
      publishedAt: "2026-03-06T03:15:00.000Z",
      collectedAt: new Date().toISOString(),
      url: "https://www.reuters.com/world/sample/global-growth",
      author: "Reuters",
      section: "World",
    },
  ],
};

const clampPerSource = (perSource: number | undefined) => {
  if (!perSource || Number.isNaN(perSource)) {
    return MAX_DEFAULT_PER_SOURCE;
  }

  // Allow higher per-source fetch counts to support RSS feeds which can provide
  // many entries. A very large fetch could be expensive, so we cap it to 300.
  return Math.min(Math.max(Math.trunc(perSource), 1), 300);
};

const fetchJson = <T>(url: URL, headers: Record<string, string> = {}): Promise<T> => {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers }, (response) => {
      const chunks: Buffer[] = [];

      response.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf-8");
        const statusCode = response.statusCode ?? 500;

        if (statusCode >= 400) {
          reject(new Error(`Request failed with status ${statusCode}: ${body}`));
          return;
        }

        try {
          resolve(JSON.parse(body) as T);
        } catch (error) {
          reject(error);
        }
      });
    });

    request.on("error", reject);
  });
};

const fetchText = (url: URL, headers: Record<string, string> = {}): Promise<string> => {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers }, (response) => {
      const chunks: Buffer[] = [];

      response.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf-8");
        const statusCode = response.statusCode ?? 500;

        if (statusCode >= 400) {
          reject(new Error(`Request failed with status ${statusCode}: ${body}`));
          return;
        }

        resolve(body);
      });
    });

    request.on("error", reject);
  });
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  trimValues: true,
});

const stripTags = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

const asArray = <T>(value: T | T[] | undefined): T[] => {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
};

const buildSampleArticles = (
  config: NewsSourceConfig,
  keyword: string | undefined,
  perSource: number,
): RawArticle[] => {
  const normalizedKeyword = keyword?.trim().toLowerCase();
  const baseArticles = sampleArticlesBySource[config.id] ?? [];
  const filtered = normalizedKeyword
    ? baseArticles.filter((article) => {
        const haystack = `${article.headline} ${article.content}`.toLowerCase();
        return haystack.includes(normalizedKeyword);
      })
    : baseArticles;

  const selected = (filtered.length > 0 ? filtered : baseArticles)
    .slice(0, perSource)
    .map((article) => ({
      ...article,
      collectedAt: new Date().toISOString(),
    }));

  return selected;
};

const buildGuardianUrl = (
  config: NewsSourceConfig,
  keyword: string | undefined,
  perSource: number,
  page?: number,
) => {
  const url = new URL("/search", config.baseUrl);
  url.searchParams.set("api-key", config.apiKey ?? "");
  url.searchParams.set("page-size", String(perSource));
  url.searchParams.set("show-fields", "headline,trailText,bodyText,byline");
  url.searchParams.set("order-by", "newest");

  if (page && page > 1) {
    url.searchParams.set("page", String(page));
  }

  if (keyword?.trim()) {
    url.searchParams.set("q", keyword.trim());
  }

  return url;
};

const collectGuardianArticles = async (
  config: NewsSourceConfig,
  keyword: string | undefined,
  perSource: number,
  page?: number,
): Promise<RawArticle[]> => {
  const response = await fetchJson<GuardianApiResponse>(
    buildGuardianUrl(config, keyword, perSource, page),
  );

  return (response.response?.results ?? []).map((article, index) => ({
    id: article.id ?? `${config.id}-${Date.now()}-${index}`,
    sourceId: config.id,
    sourceName: config.name,
    headline: article.fields?.headline ?? article.webTitle ?? "Untitled article",
    content:
      article.fields?.bodyText ?? article.fields?.trailText ?? "Content unavailable",
    publishedAt: article.webPublicationDate ?? new Date().toISOString(),
    collectedAt: new Date().toISOString(),
    url: article.webUrl ?? `${config.baseUrl}/article/${index}`,
    author: article.fields?.byline,
    section: article.sectionName,
  }));
};

const collectGenericArticles = async (
  config: NewsSourceConfig,
  keyword: string | undefined,
  perSource: number,
): Promise<RawArticle[]> => {
  const urlValue = config.apiUrl;
  if (!urlValue) {
    return [];
  }

  const url = new URL(urlValue);
  url.searchParams.set("pageSize", String(perSource));

  if (keyword?.trim()) {
    url.searchParams.set("q", keyword.trim());
  }

  const headers: Record<string, string> = {};
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
    headers["x-api-key"] = config.apiKey;
  }

  const response = await fetchJson<GenericNewsApiResponse>(url, {
    ...headers,
  });

  const items = response.articles ?? response.results ?? [];
  return items.map((article, index) => ({
    id: article.id ?? `${config.id}-${Date.now()}-${index}`,
    sourceId: config.id,
    sourceName: config.name,
    headline: article.title ?? "Untitled article",
    content: article.content ?? article.description ?? "Content unavailable",
    publishedAt: article.publishedAt ?? new Date().toISOString(),
    collectedAt: new Date().toISOString(),
    url: article.url ?? `${config.baseUrl}/article/${index}`,
    author: article.author,
    section: article.category,
  }));
};

const collectNytTopStories = async (
  config: NewsSourceConfig,
  perSource: number,
): Promise<RawArticle[]> => {
  const url = new URL(config.apiUrl ?? "/svc/topstories/v2/home.json", config.baseUrl);
  url.searchParams.set("api-key", config.apiKey ?? "");

  const response = await fetchJson<NytTopStoriesResponse>(url);
  return (response.results ?? []).slice(0, perSource).map((article, index) => ({
    id: article.uri ?? `${config.id}-${Date.now()}-${index}`,
    sourceId: config.id,
    sourceName: config.name,
    headline: article.title ?? "Untitled article",
    content: article.abstract ?? "Content unavailable",
    publishedAt: article.published_date ?? new Date().toISOString(),
    collectedAt: new Date().toISOString(),
    url: article.url ?? article.short_url ?? `${config.baseUrl}/article/${index}`,
    author: article.byline,
    section: [article.section, article.subsection].filter(Boolean).join(" / ") || undefined,
  }));
};

const collectNytMostPopular = async (
  config: NewsSourceConfig,
  perSource: number,
): Promise<RawArticle[]> => {
  const url = new URL(config.apiUrl ?? "/svc/mostpopular/v2/viewed/1.json", config.baseUrl);
  if (config.apiKey) {
    url.searchParams.set("api-key", config.apiKey);
  }

  const response = await fetchJson<NytMostPopularResponse>(url);
  return (response.results ?? []).slice(0, perSource).map((article, index) => ({
    id: article.uri ?? `${config.id}-${Date.now()}-${index}`,
    sourceId: config.id,
    sourceName: config.name,
    headline: article.title ?? "Untitled article",
    content: article.abstract ?? "Content unavailable",
    publishedAt: article.published_date ?? new Date().toISOString(),
    collectedAt: new Date().toISOString(),
    url: article.url ?? `${config.baseUrl}/article/${index}`,
    author: article.byline,
    section: [article.section, article.subsection].filter(Boolean).join(" / ") || undefined,
  }));
};

const collectRssFeed = async (
  config: NewsSourceConfig,
  keyword: string | undefined,
  perSource: number,
): Promise<RawArticle[]> => {
  const rssUrl = config.rssUrl;
  if (!rssUrl) {
    return [];
  }

  const xml = await fetchText(new URL(rssUrl));
  const parsed = parser.parse(xml) as {
    rss?: { channel?: { item?: RssChannelItem | RssChannelItem[] } };
    feed?: { entry?: AtomEntry | AtomEntry[] };
  };

  const normalizedKeyword = keyword?.trim().toLowerCase();

  const rssItems = asArray(parsed.rss?.channel?.item).map((item, index) => {
    const headline = item.title || "Untitled article";
    const content = stripTags(item["content:encoded"] || item.description || "Content unavailable");
    const guidValue =
      typeof item.guid === "string"
        ? item.guid
        : item.guid && typeof item.guid === "object"
          ? item.guid["#text"] || ""
          : "";
    const articleUrl = item.link || `${config.baseUrl}/article/${index}`;

    return {
      id: guidValue || articleUrl || `${config.id}-${Date.now()}-${index}`,
      sourceId: config.id,
      sourceName: config.name,
      headline,
      content,
      publishedAt: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
      collectedAt: new Date().toISOString(),
      url: articleUrl,
    } as RawArticle;
  });

  const atomItems = asArray(parsed.feed?.entry).map((entry, index) => {
    const headline = typeof entry.title === "string" ? entry.title : entry.title?.["#text"] || "Untitled article";
    const content = stripTags(
      typeof entry.summary === "string"
        ? entry.summary
        : entry.summary?.["#text"] || "Content unavailable",
    );
    const links = asArray(entry.link);
    const articleUrl = links[0]?.href || `${config.baseUrl}/article/${index}`;

    return {
      id: entry.id || articleUrl || `${config.id}-${Date.now()}-${index}`,
      sourceId: config.id,
      sourceName: config.name,
      headline,
      content,
      publishedAt: new Date(entry.updated || entry.published || Date.now()).toISOString(),
      collectedAt: new Date().toISOString(),
      url: articleUrl,
    } as RawArticle;
  });

  const combined = [...rssItems, ...atomItems];
  const filtered = normalizedKeyword
    ? combined.filter((article) =>
        `${article.headline} ${article.content}`.toLowerCase().includes(normalizedKeyword),
      )
    : combined;

  return filtered.slice(0, perSource);
};

const collectLiveArticles = async (
  config: NewsSourceConfig,
  keyword: string | undefined,
  perSource: number,
  page?: number,
): Promise<RawArticle[]> => {
  switch (config.provider) {
    case "guardian-search":
      return collectGuardianArticles(config, keyword, perSource, page);
    case "generic-query":
      return collectGenericArticles(config, keyword, perSource);
    case "nyt-top-stories":
      return collectNytTopStories(config, perSource);
    case "nyt-most-popular":
      return collectNytMostPopular(config, perSource);
    case "rss-feed":
      return collectRssFeed(config, keyword, perSource);
    default:
      return [];
  }
};

const collectFromSource = async (
  config: NewsSourceConfig,
  keyword: string | undefined,
  perSource: number,
  pages: number = 1,
): Promise<{ articles: RawArticle[]; summary: SourceCollectionResult }> => {
  const hasConfiguredKey = config.apiKey ? !isPlaceholderSecret(config.apiKey) : true;
  const hasConfiguredUrl =
    config.provider === "rss-feed"
      ? !isPlaceholderSecret(config.rssUrl)
      : !config.apiUrl || !isPlaceholderSecret(config.apiUrl);

  try {
    let articles: RawArticle[] = [];

    if (isSourceConfigured(config) && hasConfiguredKey && hasConfiguredUrl) {
      if (pages > 1 && config.provider === "guardian-search") {
        const collectedPages: number[] = [];
        for (let page = 1; page <= pages; page += 1) {
          const pageArticles = await collectLiveArticles(config, keyword, perSource, page);
          if (pageArticles.length === 0) {
            break;
          }
          articles.push(...pageArticles);
          collectedPages.push(page);
        }

        const note = collectedPages.length
          ? `Collected pages ${collectedPages[0]}-${collectedPages[collectedPages.length - 1]}`
          : "No articles found for requested pages.";

        if (articles.length > 0) {
          return {
            articles,
            summary: {
              sourceId: config.id,
              sourceName: config.name,
              articlesCollected: articles.length,
              mode: "live",
              note,
            },
          };
        }
      } else {
        articles = await collectLiveArticles(config, keyword, perSource);
        if (articles.length > 0) {
          return {
            articles,
            summary: {
              sourceId: config.id,
              sourceName: config.name,
              articlesCollected: articles.length,
              mode: "live",
            },
          };
        }
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown collection failure";
    const sampleArticles = buildSampleArticles(config, keyword, perSource);
    return {
      articles: sampleArticles,
      summary: {
        sourceId: config.id,
        sourceName: config.name,
        articlesCollected: sampleArticles.length,
        mode: "sample",
        note: `Fell back to sample data: ${message}`,
      },
    };
  }

  const sampleArticles = buildSampleArticles(config, keyword, perSource);
  return {
    articles: sampleArticles,
    summary: {
      sourceId: config.id,
      sourceName: config.name,
      articlesCollected: sampleArticles.length,
      mode: "sample",
      note: "Source configuration placeholder detected.",
    },
  };
};

export const collectArticlesFromSources = async (
  options: CollectArticlesOptions,
): Promise<{ articles: RawArticle[]; sourceBreakdown: SourceCollectionResult[] }> => {
  const perSource = clampPerSource(options.perSource);
  const selectedSources = options.sourceIds?.length
    ? NEWS_SOURCES.filter((source) => options.sourceIds?.includes(source.id))
    : NEWS_SOURCES;

  const sourceBreakdown: SourceCollectionResult[] = [];
  const articles: RawArticle[] = [];

  for (const source of selectedSources) {
    const result = await collectFromSource(source, options.keyword, perSource, options.pages ?? 1);
    articles.push(...result.articles);
    sourceBreakdown.push(result.summary);
  }

  return { articles, sourceBreakdown };
};
