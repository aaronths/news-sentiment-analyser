import { promises as fs } from "fs";
import path from "path";
import request from "supertest";
import { describe, it, expect, afterAll, beforeAll } from "@jest/globals";
import { app, server } from "../src/main";

const cleanArticlesPath = path.resolve(__dirname, "../../../data/clean-articles.json");

beforeAll(async () => {
  await fs.mkdir(path.dirname(cleanArticlesPath), { recursive: true });
  await fs.writeFile(
    cleanArticlesPath,
    JSON.stringify(
      [
        {
          id: "guardian-clean-1",
          sourceId: "guardian",
          sourceName: "The Guardian",
          title: "Election housing focus",
          body: "Housing affordability remains central to the election debate.",
          summary: "Housing affordability remains central to the election debate.",
          publishedAt: "2026-03-05T09:00:00.000Z",
          collectedAt: "2026-03-05T09:10:00.000Z",
          url: "https://example.com/guardian-clean-1",
          keywordTokens: ["election", "housing", "affordability"],
          sentimentText: "Election housing focus. Housing affordability remains central to the election debate."
        }
      ],
      null,
      2,
    ),
    "utf-8",
  );
});

afterAll((done) => {
  server.close(done);
});

describe("GET /api/articles", () => {
  it("should return filtered clean articles by keyword", async () => {
    const res = await request(app).get("/api/articles").query({ keyword: "election" });
    expect(res.status).toBe(200);
    expect(res.body.totalMatches).toBe(1);
    expect(res.body.articles[0].sourceId).toBe("guardian");
  });
});
