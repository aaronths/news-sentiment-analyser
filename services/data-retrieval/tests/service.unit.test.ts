import fs from "fs";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from "@jest/globals";

// We intentionally load modules inside tests to allow env var tweaks and reset module cache.

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "data-retrieval-test-"));
const localCleanPath = path.join(tempDir, "clean-articles.json");

const sampleArticles = [
  {
    id: "1",
    sourceId: "a",
    sourceName: "Source A",
    title: "Positive news",
    body: "This is a great day.",
    publishedAt: "2025-01-01T12:00:00Z",
    keywordTokens: ["positive", "day"],
    sentiment: 0.8,
  },
  {
    id: "2",
    sourceId: "b",
    sourceName: "Source B",
    title: "Bad outcome",
    body: "This is terrible.",
    publishedAt: "2025-01-02T12:00:00Z",
    keywordTokens: ["bad", "outcome"],
    sentiment: -0.6,
  },
];

describe("articles.service helpers and storage behavior", () => {

  beforeAll(() => {
    fs.writeFileSync(localCleanPath, JSON.stringify(sampleArticles));
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  });

  afterEach(() => {
    // Keep test isolation: clear env vars and reset module cache
    delete process.env.NEWS_DATA_BUCKET;
    delete process.env.NEWS_DATA_STORAGE_MODE;
    delete process.env.NEWS_DATA_LOCAL_CLEAN_PATH;
    jest.resetModules();
  });

  it("parseLimit clamps values and uses defaults", async () => {
    const { parseLimit } = await import("../src/services/articles.service");

    expect(parseLimit(undefined)).toBe(20);
    expect(parseLimit("not-a-number")).toBe(20);
    expect(parseLimit("0")).toBe(1);
    expect(parseLimit("1000")).toBe(100);
    expect(parseLimit("50")).toBe(50);
  });

  it("parseTimeframe returns expected values and rejects invalid ones", async () => {
    const { parseTimeframe } = await import("../src/services/articles.service");

    expect(parseTimeframe("24h", "7d")).toBe("24h");
    expect(parseTimeframe("7d", "24h")).toBe("7d");
    expect(parseTimeframe("", "30d")).toBe("30d");
    expect(parseTimeframe("invalid", "7d")).toBeNull();
  });

  it("labelForCompound categorizes sentiment correctly", async () => {
    const { labelForCompound } = await import("../src/services/articles.service");

    expect(labelForCompound(0.1)).toBe("positive");
    expect(labelForCompound(-0.1)).toBe("negative");
    expect(labelForCompound(0)).toBe("neutral");
    expect(labelForCompound(0.04)).toBe("neutral");
    expect(labelForCompound(-0.04)).toBe("neutral");
  });

  it("can compute trending keywords and aggregate sources", async () => {
    const { getTrendingKeywords, aggregateSources } = await import(
      "../src/services/articles.service"
    );

    const trending = getTrendingKeywords(sampleArticles, 10);
    expect(trending.find((t) => t.keyword === "positive")).toBeDefined();

    const sources = aggregateSources(sampleArticles);
    expect(sources.find((s) => s.id === "a")).toBeDefined();
    expect(sources.find((s) => s.id === "b")).toBeDefined();
  });

  it("loadCleanArticles uses local file when storage mode is local-file", async () => {
    process.env.NEWS_DATA_STORAGE_MODE = "local-file";
    process.env.NEWS_DATA_LOCAL_CLEAN_PATH = localCleanPath;

    const { loadCleanArticles } = await import("../src/services/articles.service");
    const data = await loadCleanArticles();

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(2);
    expect(data[0].id).toBe("1");
  });

  it("loadCleanArticles uses S3 when storage mode is s3 and bucket is configured", async () => {
    process.env.NEWS_DATA_STORAGE_MODE = "s3";
    process.env.NEWS_DATA_BUCKET = "some-bucket";

    const { loadCleanArticles } = await import("../src/services/articles.service");
    const { S3Client } = await import("@aws-sdk/client-s3");

    // Jest's spy typing often resolves to `never` for overloaded methods; cast to a general SpyInstance.
    // `spyOn` typing can be too strict for overloaded methods like S3Client.send.
    const sendSpy = (jest
      .spyOn(S3Client.prototype as unknown as { send: (...args: unknown[]) => Promise<unknown> }, "send")
      .mockResolvedValue({ Body: Readable.from([JSON.stringify(sampleArticles)]) })
    ) as unknown as ReturnType<typeof jest.spyOn>;

    const data = await loadCleanArticles();
    expect(data.length).toBe(2);
    expect(sendSpy).toHaveBeenCalled();

    sendSpy.mockRestore();
  });

  it("loadCleanArticles falls back to local file when S3 read fails", async () => {
    process.env.NEWS_DATA_STORAGE_MODE = "s3";
    process.env.NEWS_DATA_BUCKET = "some-bucket";
    process.env.NEWS_DATA_LOCAL_CLEAN_PATH = localCleanPath;

    const { loadCleanArticles } = await import("../src/services/articles.service");
    const { S3Client } = await import("@aws-sdk/client-s3");

    const sendSpy = (jest
      .spyOn(S3Client.prototype as unknown as { send: (...args: unknown[]) => Promise<unknown> }, "send")
      .mockRejectedValue(new Error("network failure"))
    ) as unknown as ReturnType<typeof jest.spyOn>;

    const data = await loadCleanArticles();
    expect(data.length).toBe(2);
    expect(sendSpy).toHaveBeenCalled();

    sendSpy.mockRestore();
  });

  it("computeSentimentForArticles uses vader for missing precomputed sentiment", async () => {
    const { computeSentimentForArticles } = await import("../src/services/articles.service");

    const [result] = await computeSentimentForArticles([
      { id: "x", title: "Good news", body: "Great product", sentimentText: "Great!" },
    ]);

    expect(result.scores.compound).toBeDefined();
    expect(typeof result.scores.compound).toBe("number");
  });
});

describe("charts.service helpers", () => {
  const mockArticles = [
    { id: "1", sourceId: "a", sourceName: "A", title: "x", body: "y", publishedAt: "2025-01-01T00:00:00Z" },
  ];

  const mockScores = mockArticles.map((article) => ({
    article,
    scores: { compound: 0.3, pos: 0.3, neg: 0, neu: 0.7 },
  }));

  function setupChartsMocks() {
    jest.resetModules();
    jest.doMock("../src/services/articles.service", () => ({
      searchArticles: async () => mockArticles,
      computeSentimentForArticles: async () => mockScores,
      labelForCompound: (value: number) => (value > 0 ? "positive" : "neutral"),
    }));
  }

  it("parseChartDimension enforces min/max and fallbacks", async () => {
    const { parseChartDimension } = await import("../src/services/charts.service");

    expect(parseChartDimension(undefined, 100, 1, 200)).toBe(100);
    expect(parseChartDimension("not-a-number", 100, 1, 200)).toBe(100);
    expect(parseChartDimension("0", 100, 1, 200)).toBe(1);
    expect(parseChartDimension("500", 100, 1, 200)).toBe(200);
    expect(parseChartDimension("150", 100, 1, 200)).toBe(150);
  });

  it("buildOutletRankings with mocked articles produces ranked output", async () => {
    setupChartsMocks();

    const { buildOutletRankings } = await import("../src/services/charts.service");
    const rankings = await buildOutletRankings("whatever");

    expect(rankings.length).toBeGreaterThan(0);
    expect(rankings[0].sourceId).toBe("a");
    expect(rankings[0].averageCompound).toBeGreaterThanOrEqual(0);
  });

  it("buildSentimentDistribution returns non-zero counts with mocked scores", async () => {
    setupChartsMocks();

    const { buildSentimentDistribution } = await import("../src/services/charts.service");
    const dist = await buildSentimentDistribution("whatever");

    expect(dist.articleCount).toBe(1);
    expect(dist.distribution).toHaveProperty("positive");
    expect(dist.distribution.positive).toBeGreaterThan(0);
  });

  it("buildDistributionChartConfig handles all-zero distribution", async () => {
    setupChartsMocks();
    jest.doMock("../src/services/articles.service", () => ({
      searchArticles: async () => [],
      computeSentimentForArticles: async () => [],
      labelForCompound: () => "neutral",
    }));

    const { buildDistributionChartConfig } = await import("../src/services/charts.service");
    const config = await buildDistributionChartConfig("whatever");

    // Expect the config to still be created even if all counts are zero
    expect(config.data.datasets[0].data).toEqual([0, 0, 0]);
  });

  it("buildRankingsChartConfig produces chart config even when no data", async () => {
    setupChartsMocks();
    // Return empty results so we cover the no-data path
    jest.doMock("../src/services/articles.service", () => ({
      searchArticles: async () => [],
      computeSentimentForArticles: async () => [],
      labelForCompound: () => "neutral",
    }));

    const { buildRankingsChartConfig } = await import("../src/services/charts.service");
    const config = await buildRankingsChartConfig("whatever");

    expect(config.data.datasets[0].data).toEqual([]);
    type ChartPlugins = { datalabels?: { display: boolean } };
    const plugins = config.options?.plugins as ChartPlugins | undefined;
    expect(plugins?.datalabels).toEqual({ display: false });
  });

  it("renderChartToPng produces a non-empty buffer", async () => {
    setupChartsMocks();

    const { buildRankingsChartConfig, renderChartToPng } = await import(
      "../src/services/charts.service"
    );

    const chartConfig = await buildRankingsChartConfig("whatever");
    const png = await renderChartToPng(chartConfig, 200, 200);
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png.length).toBeGreaterThan(0);
  });
});
