import request from "supertest";
import { describe, it, expect, afterAll } from "@jest/globals";
import { app, server } from "../src/main";

afterAll((done) => {
  server.close(done);
});

describe("GET /api/test", () => {
  it("should list configured sources", async () => {
    const res = await request(app).get("/api/sources");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sources)).toBe(true);
    expect(res.body.sources.length).toBeGreaterThan(0);
  });

  it("should collect articles using sample data when placeholders are present", async () => {
    const res = await request(app)
      .post("/api/collect")
      .send({ keyword: "election", perSource: 1, sources: ["guardian", "abc"] });

    expect(res.status).toBe(201);
    expect(res.body.collectedCount).toBeGreaterThan(0);
    expect(Array.isArray(res.body.sourceBreakdown)).toBe(true);
    expect(res.body.sourceBreakdown[0].mode).toBeDefined();
  });
});
