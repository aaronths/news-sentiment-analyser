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