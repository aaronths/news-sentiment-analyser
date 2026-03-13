import request from "supertest";
import { describe, it, expect, afterAll, beforeAll } from "@jest/globals";
import { app, server } from "../src/main";

afterAll((done) => {
  server.close(done);
});

describe("GET /api/test", () => {
  it("should return success: true", async () => {
    const res = await request(app).get("/api/test");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
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