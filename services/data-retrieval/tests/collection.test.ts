import fs from "fs";
import path from "path";
import request from "supertest";
import { describe, it, expect, afterAll, beforeAll, jest } from "@jest/globals";
import { S3Client } from "@aws-sdk/client-s3";
import { app, server } from "../src/main";

// ensure the HTTP server is closed after tests
afterAll((done) => {
  if (!server) {
    done();
    return;
  }
  server.close(done);
});

// write a small known dataset before the tests run; the service will load
// this file when NEWS_DATA_BUCKET is unset
beforeAll(() => {
  process.env.NEWS_DATA_BUCKET = "";
  // service expects the fallback at project-root/data/clean-articles.json
  // __dirname is services/data-retrieval/tests; go up three levels to repo root
  const dataPath = path.resolve(__dirname, "../../../data/clean-articles.json");
  const currentYear = new Date().getUTCFullYear();
  const sample = [
    {
      id: "test_article",
      sourceId: "test",
      sourceName: "Test Source",
      title: "Foo bar baz",
      body: "This is a test article about economy and other things.",
      summary: "Test article",
      publishedAt: new Date().toISOString(),
      url: "http://example.com/test",
      keywordTokens: ["economy", "test"],
      sentimentText: "This is a test article about economy and other things."
    },
    {
      id: "precomputed_sentiment_article",
      sourceId: "precomputed",
      sourceName: "Precomputed Source",
      title: "Customscore market update",
      body: "Fantastic outcomes and optimistic language.",
      summary: "Precomputed sentiment record",
      publishedAt: new Date().toISOString(),
      url: "http://example.com/precomputed",
      keywordTokens: ["customscore", "market"],
      sentimentText: "Fantastic outcomes and optimistic language.",
      sentiment: -0.8
    },
    {
      id: "trump_jan_test",
      sourceId: "test",
      sourceName: "Test Source",
      title: "Trump rally draws crowds",
      body: "Coverage focused on Trump and campaign reactions.",
      summary: "Trump mention in January",
      publishedAt: `${currentYear}-01-15T12:00:00.000Z`,
      url: "http://example.com/trump-jan",
      keywordTokens: ["trump", "campaign"],
      sentimentText: "Coverage focused on Trump and campaign reactions."
    },
    {
      id: "trump_feb_precomputed",
      sourceId: "precomputed",
      sourceName: "Precomputed Source",
      title: "Markets react as Trump comments on policy",
      body: "Analysts examined financial impact after Trump remarks.",
      summary: "Trump mention in February",
      publishedAt: `${currentYear}-02-11T08:30:00.000Z`,
      url: "http://example.com/trump-feb",
      keywordTokens: ["trump", "markets"],
      sentimentText: "Analysts examined financial impact after Trump remarks."
    },
    {
      id: "trump_feb_test",
      sourceId: "test",
      sourceName: "Test Source",
      title: "Analysts discuss Trump speech",
      body: "Another article mentioning Trump in title for monthly chart checks.",
      summary: "Second Trump mention in February",
      publishedAt: `${currentYear}-02-23T17:45:00.000Z`,
      url: "http://example.com/trump-feb-2",
      keywordTokens: ["trump", "speech"],
      sentimentText: "Another article mentioning Trump in title for monthly chart checks."
    }
  ];
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  fs.writeFileSync(dataPath, JSON.stringify(sample));
});

describe("GET /api/test", () => {
  it("should return success: true", async () => {
    const res = await request(app).get("/api/test");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("Storage mode environment", () => {
  it("should use local file when NEWS_DATA_STORAGE_MODE=local-file even if bucket is set", async () => {
    process.env.NEWS_DATA_STORAGE_MODE = "local-file";
    process.env.NEWS_DATA_BUCKET = "some-bucket";

    const sendSpy = jest.spyOn(S3Client.prototype, "send");

    // Reload module to ensure cache is cleared and storage mode is evaluated fresh
    jest.resetModules();
    const { loadCleanArticles } = await import("../src/services/articles.service");

    const articles = await loadCleanArticles();
    expect(Array.isArray(articles)).toBe(true);
    expect(sendSpy).not.toHaveBeenCalled();

    sendSpy.mockRestore();
  });
});

// minimal smoke tests for the swagger endpoints

describe("Swagger endpoints", () => {
  beforeAll(() => {
    // force local fallback so tests are deterministic
    process.env.NEWS_DATA_BUCKET = "";
  });

  it("GET /api/articles should require keyword", async () => {
    const res = await request(app).get("/api/articles");
    expect(res.status).toBe(400);
  });

  let firstArticleId: string;

  it("GET /api/articles with keyword returns matching list", async () => {
    const res = await request(app)
      .get("/api/articles")
      .query({ keyword: "economy" });

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.articles)).toBe(true);
    expect(res.body.keyword).toBe("economy");
    expect(res.body.totalMatches).toBeGreaterThan(0);

    // fetch metadata to obtain an article ID for subsequent tests
    const meta = await request(app)
      .get("/api/articles/metadata")
      .query({ keyword: "economy" });
    expect(meta.status).toBe(200);
    if (Array.isArray(meta.body) && meta.body.length > 0) {
      firstArticleId = meta.body[0].id;
    }
  });

  it("GET /api/articles/:id returns object when present", async () => {
    expect(firstArticleId).toBeDefined();
    const res = await request(app).get(`/api/articles/${firstArticleId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(firstArticleId);
  });

  it("GET /api/articles/:id returns 404 if missing", async () => {
    const res = await request(app).get("/api/articles/doesnotexist");
    expect(res.status).toBe(404);
  });

  it("GET /api/sentiment requires keyword", async () => {
    const res = await request(app).get("/api/sentiment");
    expect(res.status).toBe(400);
  });

  it("GET /api/sentiment with keyword returns object", async () => {
    const res = await request(app)
      .get("/api/sentiment")
      .query({ keyword: "inflation" });
    expect(res.status).toBe(200);
    expect(res.body.keyword).toBe("inflation");
    expect(res.body.articleCount).toBeGreaterThanOrEqual(0);
  });

  it("GET /api/sentiment uses precomputed score when provided", async () => {
    const res = await request(app)
      .get("/api/sentiment")
      .query({ keyword: "customscore" });

    expect(res.status).toBe(200);
    expect(res.body.keyword).toBe("customscore");
    expect(res.body.articleCount).toBe(1);
    expect(res.body.averageSentiment).toBeLessThan(-0.5);
  });

  it("GET /api/charts/rankings with keyword returns Chart.js config", async () => {
    const res = await request(app)
      .get("/api/charts/rankings")
      .query({ keyword: "economy" });

    expect(res.status).toBe(200);
    expect(res.body.type).toBe("bar");
    expect(Array.isArray(res.body?.data?.datasets)).toBe(true);
  });

  it("GET /api/charts/rankings.png with keyword returns image", async () => {
    const res = await request(app)
      .get("/api/charts/rankings.png")
      .query({ keyword: "economy" });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(res.body).toBeDefined();
  });

  it("GET /api/charts/rankings returns 400 without keyword", async () => {
    const res = await request(app).get("/api/charts/rankings");
    expect(res.status).toBe(400);
  });

  it("GET /api/charts/distribution returns 400 without keyword", async () => {
    const res = await request(app).get("/api/charts/distribution");
    expect(res.status).toBe(400);
  });

  it("GET /api/charts/rankings.png returns 400 without keyword", async () => {
    const res = await request(app).get("/api/charts/rankings.png");
    expect(res.status).toBe(400);
  });

  it("GET /api/charts/distribution.png returns 400 without keyword", async () => {
    const res = await request(app).get("/api/charts/distribution.png");
    expect(res.status).toBe(400);
  });

  it("GET /api/sources returns indexed source list", async () => {
    const res = await request(app).get("/api/sources").query({ limit: 5 });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/trending returns keyword frequencies", async () => {
    const res = await request(app).get("/api/trending").query({ timeframe: "30d", limit: 5 });
    expect(res.status).toBe(200);
    expect(res.body.timeframe).toBe("30d");
    expect(Array.isArray(res.body.keywords)).toBe(true);
  });

  it("GET /api/sentiment/source requires sourceId", async () => {
    const res = await request(app)
      .get("/api/sentiment/source")
      .query({ keyword: "economy" });
    expect(res.status).toBe(400);
  });

  it("GET /api/sentiment/source returns source summary", async () => {
    const res = await request(app)
      .get("/api/sentiment/source")
      .query({ keyword: "economy", sourceId: "test", timeframe: "30d" });
    expect(res.status).toBe(200);
    expect(res.body.sourceId).toBe("test");
    expect(res.body.keyword).toBe("economy");
  });

  it("GET /api/sentiment/compare returns comparison payload", async () => {
    const res = await request(app)
      .get("/api/sentiment/compare")
      .query({ keyword: "economy", timeframe: "30d" });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.comparisons)).toBe(true);
  });

  it("GET /api/chart/sentiment/trend returns chart-ready payload", async () => {
    const res = await request(app)
      .get("/api/chart/sentiment/trend")
      .query({ keyword: "economy", timeframe: "30d" });
    expect(res.status).toBe(200);
    expect(res.body.chartType).toBe("line");
    expect(Array.isArray(res.body.labels)).toBe(true);
    expect(Array.isArray(res.body.datasets)).toBe(true);
  });

  it("GET /api/chart/sources/compare returns chart-ready payload", async () => {
    const res = await request(app)
      .get("/api/chart/sources/compare")
      .query({ keyword: "economy", timeframe: "30d" });
    expect(res.status).toBe(200);
    expect(res.body.chartType).toBe("bar");
    expect(Array.isArray(res.body.labels)).toBe(true);
    expect(Array.isArray(res.body.datasets)).toBe(true);
  });

  it("GET /api/chart/mentions/monthly returns grouped monthly mentions chart", async () => {
    const year = new Date().getUTCFullYear();
    const res = await request(app)
      .get("/api/chart/mentions/monthly")
      .query({ keyword: "Trump", year, sourceLimit: 5 });

    expect(res.status).toBe(200);
    expect(res.body.chartType).toBe("bar");
    expect(Array.isArray(res.body.labels)).toBe(true);
    expect(res.body.labels).toHaveLength(12);
    expect(Array.isArray(res.body.datasets)).toBe(true);
    expect(res.body.datasets.length).toBeGreaterThan(0);
    expect(res.body.meta.keyword).toBe("Trump");
    expect(res.body.meta.year).toBe(year);
    expect(res.body.meta.totalMentions).toBeGreaterThan(0);
  });

  it("GET /api/chart/mentions/monthly.png returns image", async () => {
    const year = new Date().getUTCFullYear();
    const res = await request(app)
      .get("/api/chart/mentions/monthly.png")
      .query({ keyword: "Trump", year, sourceLimit: 5 });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/png");
    expect(res.body).toBeDefined();
  });

  it("GET /api/chart/mentions/monthly returns 400 when year is invalid", async () => {
    const res = await request(app)
      .get("/api/chart/mentions/monthly")
      .query({ keyword: "Trump", year: "not-a-year", sourceLimit: 5 });

    expect(res.status).toBe(400);
  });

  it("GET /api/chart/mentions/monthly works with multi-word keyword", async () => {
    const year = new Date().getUTCFullYear();
    const res = await request(app)
      .get("/api/chart/mentions/monthly")
      .query({ keyword: "Trump rally", year, sourceLimit: 5 });

    expect(res.status).toBe(200);
    expect(res.body.chartType).toBe("bar");
  });

  it("GET /api/articles/:id/sentiment returns sentiment data", async () => {
    expect(firstArticleId).toBeDefined();
    const res = await request(app).get(`/api/articles/${firstArticleId}/sentiment`);
    expect(res.status).toBe(200);
    expect(res.body.sentimentScore).toBeDefined();
  });

  it("GET /api/swagger.yaml returns spec", async () => {
    const res = await request(app).get("/api/swagger.yaml");
    expect(res.status).toBe(200);
    expect(res.text).toContain("openapi: 3.0.0");
  });
});

describe("Trend endpoint", () => {
  it("GET /api/trend returns volume series", async () => {
    const res = await request(app).get("/api/trend").query({ keyword: "economy" });
    expect(res.status).toBe(200);
    expect(res.body.keyword).toBe("economy");
    expect(typeof res.body.totalArticles).toBe("number");
    expect(Array.isArray(res.body.dataPoints)).toBe(true);
  });
});

describe("API key endpoints", () => {
  let apiKey: string;

  it("POST /api/auth/key creates a new key", async () => {
    const res = await request(app).post("/api/auth/key").send({ label: "test key" });
    expect(res.status).toBe(201);
    expect(res.body.keyId).toBeDefined();
    expect(res.body.key).toBeDefined();
    apiKey = res.body.key;
  });

  it("GET /api/auth/key returns metadata when authenticated", async () => {
    const res = await request(app)
      .get("/api/auth/key")
      .set("X-API-Key", apiKey);
    expect(res.status).toBe(200);
    expect(res.body.keyId).toBeDefined();
    expect(res.body.status).toBe("active");
  });

  it("DELETE /api/auth/key revokes the key", async () => {
    const res = await request(app)
      .delete("/api/auth/key")
      .set("X-API-Key", apiKey);
    expect(res.status).toBe(200);
    expect(res.body.keyId).toBeDefined();
    expect(res.body.message).toContain("revoked");
  });

  it("GET /api/auth/key returns 404 after revocation", async () => {
    const res = await request(app)
      .get("/api/auth/key")
      .set("X-API-Key", apiKey);
    expect(res.status).toBe(404);
  });
});