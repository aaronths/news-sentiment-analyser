import { promises as fs } from "fs";
import path from "path";

import { loadEnvironment } from "../src/config/load-environment";
import { isPlaceholderSecret, isSourceConfigured, NEWS_SOURCES } from "../src/config/news-sources";
import { toCleanArticle, preprocessArticles } from "../src/services/preprocess.service";
import {
  appendRawArticles,
  getRawArticlesPath,
  readIngestSummary,
  readRawArticles,
  writeIngestSummary,
} from "../src/services/data-store.service";
import { uploadFileToS3 } from "../src/services/s3-sync.service";
import { runIngestionPipeline } from "../src/services/ingestion-pipeline.service";

const getDataDir = () => path.dirname(getRawArticlesPath());
const ingestSummaryPath = path.join(getDataDir(), "ingest-summary.json");

const makeRawArticle = (id: string): any => ({
  id,
  sourceId: "test-source",
  sourceName: "Test Source",
  headline: "<h1>Hello world</h1>",
  content: "<p>Foo bar baz.</p>",
  publishedAt: new Date().toISOString(),
  collectedAt: new Date().toISOString(),
  url: "https://example.com",
});

describe("utils and services", () => {
  describe("news-sources helpers", () => {
    it("detects placeholder secrets", () => {
      expect(isPlaceholderSecret(undefined)).toBe(true);
      expect(isPlaceholderSecret("")).toBe(true);
      expect(isPlaceholderSecret("your-foo")).toBe(true);
      expect(isPlaceholderSecret("PLACEHOLDER_VALUE")).toBe(true);
      expect(isPlaceholderSecret("real-value")).toBe(false);
    });

    it("flags configured sources correctly", () => {
      const placeholderSource = {
        id: "fake",
        name: "Fake",
        provider: "rss-feed",
        baseUrl: "https://example.com",
        rssUrlEnvVar: "FAKE_RSS",
        rssUrl: "your-fake-url",
      } as const;

      expect(isSourceConfigured(placeholderSource)).toBe(false);

      const configuredSource = {
        ...placeholderSource,
        rssUrl: "https://example.com/feed",
      } as const;

      expect(isSourceConfigured(configuredSource)).toBe(true);
    });

    it("has at least one source configured", () => {
      expect(NEWS_SOURCES.length).toBeGreaterThan(0);
      expect(NEWS_SOURCES.some(isSourceConfigured)).toBe(true);
    });
  });

  describe("preprocess.service", () => {
    it("normalizes HTML, trims whitespace, and extracts keyword tokens", () => {
      const raw = makeRawArticle("test-1");
      raw.headline = "  <b>Hi</b>   there  ";
      raw.content = "<p>   This is a test sentence with fill words and stop words.   </p>";

      const clean = toCleanArticle(raw);
      expect(clean.title).toBe("Hi there");
      expect(clean.body).toBe("This is a test sentence with fill words and stop words.");
      expect(clean.keywordTokens).toEqual(expect.arrayContaining(["fill", "sentence", "stop", "test", "words"]));
      expect(clean.keywordTokens).not.toContain("and");
      expect(clean.summary).toBe(clean.body);
    });

    it("truncates summaries longer than 220 chars", () => {
      const raw = makeRawArticle("test-2");
      raw.content = "x".repeat(1000);

      const clean = toCleanArticle(raw);
      expect(clean.summary.length).toBeLessThanOrEqual(220);
      expect(clean.summary.endsWith("...")).toBe(true);
    });

    it("dedupes articles by id and sorts by publishedAt", () => {
      const now = new Date();
      const old = { ...makeRawArticle("same"), publishedAt: new Date(now.getTime() - 1000).toISOString() };
      const recent = { ...makeRawArticle("same"), publishedAt: now.toISOString() };

      const result = preprocessArticles([old, recent]);
      expect(result.length).toBe(1);
      expect(result[0].publishedAt).toBe(recent.publishedAt);
    });
  });

  describe("data store", () => {
    let rawBackup: string;
    let summaryBackup: string | null;

    beforeAll(async () => {
      await fs.mkdir(getDataDir(), { recursive: true });

      try {
        rawBackup = await fs.readFile(getRawArticlesPath(), "utf-8");
      } catch {
        rawBackup = "[]\n";
        await fs.writeFile(getRawArticlesPath(), rawBackup, "utf-8");
      }

      summaryBackup = await fs.readFile(ingestSummaryPath, "utf-8").catch(() => null);
    });

    afterAll(async () => {
      await fs.writeFile(getRawArticlesPath(), rawBackup, "utf-8");
      if (summaryBackup !== null) {
        await fs.writeFile(ingestSummaryPath, summaryBackup, "utf-8");
      } else {
        await fs.rm(ingestSummaryPath, { force: true });
      }
    });

    it("reads and appends raw articles with deduplication", async () => {
      await fs.writeFile(getRawArticlesPath(), "[]\n", "utf-8");

      const result1 = await appendRawArticles([makeRawArticle("1"), makeRawArticle("2")]);
      expect(result1.totalArticles).toBe(2);
      expect(result1.newArticles).toBe(2);

      // Appending the same again should not increase count
      const result2 = await appendRawArticles([makeRawArticle("2")]);
      expect(result2.totalArticles).toBe(2);
      expect(result2.newArticles).toBe(0);

      const read = await readRawArticles();
      expect(read).toHaveLength(2);
    });

    it("writes and reads ingest summaries", async () => {
      const summary = { test: true };
      await writeIngestSummary(summary);
      const read = await readIngestSummary();
      expect(read).toMatchObject(summary);
    });
  });

  describe("s3 sync service", () => {
    it("returns mock results when not in s3 mode", async () => {
      process.env.NEWS_DATA_STORAGE_MODE = "local-file";

      await fs.mkdir(getDataDir(), { recursive: true });
      const tmpFile = path.join(getDataDir(), "tmp-test-file.txt");
      await fs.writeFile(tmpFile, "hello", "utf-8");

      const result = await uploadFileToS3({
        filePath: tmpFile,
        key: "test/key.json",
        contentType: "application/json",
      });

      expect(result.uploaded).toBe(false);
      expect(result.location).toContain("file://");
      expect(result.note).toContain("Mock storage mode");

      await fs.rm(tmpFile, { force: true });
    });

    it("treats missing/placeholder bucket as non-s3", async () => {
      process.env.NEWS_DATA_STORAGE_MODE = "s3";
      process.env.NEWS_DATA_BUCKET = "your-news-data-bucket";

      await fs.mkdir(getDataDir(), { recursive: true });
      const tmpFile = path.join(getDataDir(), "tmp-test-file.txt");
      await fs.writeFile(tmpFile, "hello", "utf-8");

      const result = await uploadFileToS3({
        filePath: tmpFile,
        key: "test/key.json",
        contentType: "application/json",
      });

      expect(result.uploaded).toBe(false);
      expect(result.location).toContain("file://");

      await fs.rm(tmpFile, { force: true });
      delete process.env.NEWS_DATA_BUCKET;
    });
  });

  describe("environment loading", () => {
    const envFile = path.resolve(process.cwd(), ".env.test");
    const oldNodeEnv = process.env.NODE_ENV;

    afterAll(async () => {
      process.env.NODE_ENV = oldNodeEnv;
      await fs.rm(envFile, { force: true });
      delete process.env.TEST_SPECIAL;
    });

    it("loads .env.<NODE_ENV> files", async () => {
      await fs.writeFile(envFile, "TEST_SPECIAL=loaded\n", "utf-8");
      process.env.NODE_ENV = "test";
      delete process.env.TEST_SPECIAL;

      loadEnvironment();

      expect(process.env.TEST_SPECIAL).toBe("loaded");
    });
  });

  describe("ingestion pipeline", () => {
    let rawBackup: string;
    let summaryBackup: string | null;

    beforeAll(async () => {
      rawBackup = await fs.readFile(getRawArticlesPath(), "utf-8");
      summaryBackup = await fs.readFile(ingestSummaryPath, "utf-8").catch(() => null);

      // Force all sources to use sample data to avoid network calls by default.
      process.env.GUARDIAN_API_KEY = "your-guardian-api-key";
      process.env.NYT_NEWS_API_KEY = "your-nyt-news-api-key";
      process.env.BBC_NEWS_RSS_URL = "your-bbc-url";
      process.env.REUTERS_RSS_URL = "your-reuters-url";
      process.env.NEWS_DATA_STORAGE_MODE = "local-file";
    });

    afterAll(async () => {
      await fs.writeFile(getRawArticlesPath(), rawBackup, "utf-8");
      if (summaryBackup !== null) {
        await fs.writeFile(ingestSummaryPath, summaryBackup, "utf-8");
      } else {
        await fs.rm(ingestSummaryPath, { force: true });
      }
    });

    it("runs ingestion pipeline and returns expected summary structure", async () => {
      const summary = await runIngestionPipeline({ perSource: 1, sourceIds: ["guardian"] });
      expect(summary).toHaveProperty("collectedCount");
      expect(summary).toHaveProperty("cleanCount");
      expect(summary.uploads).toBeDefined();
      expect(summary.uploads.raw.uploaded).toBe(false);
    });
  });

  describe("collectArticlesFromSources (live RSS)", () => {
    it("collects from an RSS feed when the source is configured", async () => {
      const http = await import("http");
      const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test Feed</title>
    <item>
      <title>Unit test item</title>
      <link>http://example.com/1</link>
      <description>Test description</description>
      <pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

      const server = http.createServer((req, res) => {
        res.writeHead(200, { "Content-Type": "application/rss+xml" });
        res.end(rss);
      });

      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;

      const bbcSource = NEWS_SOURCES.find((s) => s.id === "bbc");
      expect(bbcSource).toBeDefined();

      const originalUrl = bbcSource!.rssUrl;
      bbcSource!.rssUrl = `http://127.0.0.1:${port}/feed`;

      const { articles, sourceBreakdown } = await import("../src/services/source-clients").then((m) =>
        m.collectArticlesFromSources({
          sourceIds: ["bbc"],
          perSource: 5,
          keyword: "unit",
        }),
      );

      expect(articles.length).toBeGreaterThan(0);
      expect(sourceBreakdown[0].mode).toBe("live");

      bbcSource!.rssUrl = originalUrl;
      server.close();
    });
  });

  describe("collectArticlesFromSources (mocked HTTP)", () => {
    const http = require("http");
    const https = require("https");
    const originalBbcUrl = NEWS_SOURCES.find((s) => s.id === "bbc")?.rssUrl;

    beforeEach(() => {
      jest.spyOn(http, "get").mockImplementation((url: any, opts: any, cb: any) => {
        if (typeof opts === "function") {
          cb = opts;
          opts = {};
        }

        const urlString = typeof url === "string" ? url : url.href;

        let statusCode = 200;
        let headers: Record<string, string> = {};
        let body = "";

        if (urlString.includes("/search")) {
          // Guardian search endpoint
          const u = new URL(urlString);
          const page = u.searchParams.get("page") ?? "1";
          body = JSON.stringify({
            response: {
              results: page === "1" ? [{ id: "g1", webTitle: "Guardian title", webUrl: "https://g.example.com", webPublicationDate: "2024-01-01T00:00:00Z" }] : [],
            },
          });
        } else if (urlString.includes("/generic")) {
          body = JSON.stringify({ articles: [{ title: "Generic title", content: "Generic content", publishedAt: "2024-01-01T00:00:00Z" }] });
        } else if (urlString.includes("topstories")) {
          body = JSON.stringify({ results: [{ title: "NYT title", abstract: "NYT content", published_date: "2024-01-01T00:00:00Z" }] });
        } else if (urlString.includes("mostpopular")) {
          body = JSON.stringify({ results: [{ title: "NYT popular", abstract: "NYT popular content", published_date: "2024-01-01T00:00:00Z" }] });
        } else if (urlString.includes("/rss-test")) {
          // Simulate redirect then RSS response.
          if (urlString.endsWith("/rss-test")) {
            statusCode = 302;
            headers = { location: "http://example.com/rss-final" };
          } else {
            body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Redirected Feed</title><item><title>Redirected item</title><link>http://example.com/1</link><description>desc</description><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item></channel></rss>`;
          }
        } else {
          body = "{}";
        }

        const stream = new (require("stream").Readable)();
        stream._read = () => {};
        stream.statusCode = statusCode;
        stream.headers = headers;

        process.nextTick(() => {
          if (body) {
            stream.emit("data", Buffer.from(body, "utf-8"));
          }
          stream.emit("end");
        });

        cb(stream);
        return { on: jest.fn() };
      });

      jest.spyOn(https, "get").mockImplementation((http.get as any) as any);

      const bbc = NEWS_SOURCES.find((s) => s.id === "bbc");
      if (bbc) {
        bbc.rssUrl = "http://example.com/rss-test";
      }
    });

    afterEach(() => {
      (http.get as jest.Mock).mockRestore();
      (https.get as jest.Mock).mockRestore();
      const bbc = NEWS_SOURCES.find((s) => s.id === "bbc");
      if (bbc) {
        bbc.rssUrl = originalBbcUrl || bbc.rssUrl;
      }
    });

    it("collects from multiple providers and hits live code paths", async () => {
      const guardianSource = {
        id: "guardian-test",
        name: "Guardian Test",
        provider: "guardian-search",
        baseUrl: "https://content.guardianapis.com",
        apiKey: "test-key",
      } as const;

      const genericSource = {
        id: "generic-test",
        name: "Generic Test",
        provider: "generic-query",
        baseUrl: "https://example.com",
        apiUrl: "https://example.com/generic",
        apiKey: "test-key",
      } as const;

      const nytTopSource = {
        id: "nyt-top",
        name: "NYT Top",
        provider: "nyt-top-stories",
        baseUrl: "https://api.nytimes.com",
        apiUrl: "https://api.nytimes.com/svc/topstories/v2/home.json",
        apiKey: "test-key",
      } as const;

      const nytPopularSource = {
        id: "nyt-popular",
        name: "NYT Popular",
        provider: "nyt-most-popular",
        baseUrl: "https://api.nytimes.com",
        apiUrl: "https://api.nytimes.com/svc/mostpopular/v2/viewed/1.json",
        apiKey: "test-key",
      } as const;

      const rssSource = {
        id: "rss-test",
        name: "RSS Test",
        provider: "rss-feed",
        baseUrl: "https://example.com",
        rssUrl: "http://example.com/rss-test",
      } as const;

      NEWS_SOURCES.push(guardianSource as any, genericSource as any, nytTopSource as any, nytPopularSource as any, rssSource as any);

      const { articles, sourceBreakdown } = await import("../src/services/source-clients").then((m) =>
        m.collectArticlesFromSources({
          sourceIds: [
            "guardian-test",
            "generic-test",
            "nyt-top",
            "nyt-popular",
            "rss-test",
          ],
          perSource: 1,
          pages: 2,
          keyword: "test",
        }),
      );

      expect(articles.length).toBeGreaterThanOrEqual(4);
      expect(sourceBreakdown.length).toBe(5);
      const modes = sourceBreakdown.map((s) => s.mode);
      expect(modes).toHaveLength(5);
      expect(modes.every((m) => m === "live" || m === "sample")).toBe(true);

      NEWS_SOURCES.splice(-5, 5);
    });
  });
});
