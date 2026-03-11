import request from "supertest";
import { describe, it, expect, afterAll } from "@jest/globals";
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
  it("GET /api/articles should require keyword", async () => {
    const res = await request(app).get("/api/articles");
    expect(res.status).toBe(400);
  });

  it("GET /api/articles with keyword returns list", async () => {
    const res = await request(app).get("/api/articles").query({ keyword: "foo" });
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("GET /api/articles/:id returns 404", async () => {
    const res = await request(app).get("/api/articles/doesnotexist");
    expect(res.status).toBe(404);
  });

  it("GET /api/sentiment requires keyword", async () => {
    const res = await request(app).get("/api/sentiment");
    expect(res.status).toBe(400);
  });

  it("GET /api/sentiment with keyword returns object", async () => {
    const res = await request(app).get("/api/sentiment").query({ keyword: "bar" });
    expect(res.status).toBe(200);
    expect(res.body.keyword).toBe("bar");
  });

  it("GET /api/swagger.yaml returns spec", async () => {
    const res = await request(app).get("/api/swagger.yaml");
    expect(res.status).toBe(200);
    expect(res.text).toContain("openapi: 3.0.0");
  });
});