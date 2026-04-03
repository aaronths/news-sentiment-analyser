import assert from "assert";
import { api } from "../api-client";

export const articlesTests = [
  // --- GET /api/articles ---
  {
    suite: "GET /api/articles",
    testName: "Return articles for a valid keyword",
    run: async () => {
      const res = await api.get('/api/articles', {
        params: { keyword: 'inflation', limit: 5 }
      });
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      assert.ok(res.data.totalMatches !== undefined, "Missing totalMatches in response");
      assert.ok(res.data.articles !== undefined, "Missing articles in response");
    }
  },

  // --- GET /api/articles/metadata ---
  {
    suite: "GET /api/articles/metadata",
    testName: "Returns metadata list for a keyword without pagination",
    run: async () => {
      const res = await api.get('/api/articles/metadata', {
        params: { keyword: 'Inflation' }
      });
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      assert.ok(Array.isArray(res.data.data), "data is not an array");
      assert.ok(res.data.data.length >= 0, "data length is negative");

      if (res.data.data.length > 0) {
        const first = res.data.data[0];
        assert.ok(first.id !== undefined, "Missing id in first item");
        assert.ok(first.title !== undefined, "Missing title in first item");
        assert.ok(first.source !== undefined, "Missing source in first item");
        assert.ok(first.publishedAt !== undefined, "Missing publishedAt in first item");
      }
    }
  },

  // --- GET /api/trend ---
  {
    suite: "GET /api/trend",
    testName: "Returns trend data for a keyword",
    run: async () => {
      const res = await api.get('/api/trend', {
        params: { keyword: 'inflation', timeframe: '7d', sourceId: 'nyt' }
      });
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      assert.strictEqual(res.data.keyword, 'inflation', "Keyword mismatch");
      assert.strictEqual(res.data.sourceId, 'nyt', "SourceId mismatch");
      assert.strictEqual(res.data.timeframe, '7d', "Timeframe mismatch");
      assert.ok(res.data.totalArticles >= 0, "totalArticles is negative");
      assert.ok(Array.isArray(res.data.dataPoints), "dataPoints is not an array");
      assert.ok(res.data.dataPoints.length > 0, "dataPoints is empty");

      res.data.dataPoints.forEach((point: any) => {
        assert.ok(point.date !== undefined, "Missing date in dataPoint");
        assert.ok(point.articleCount !== undefined, "Missing articleCount in dataPoint");
        assert.strictEqual(typeof point.date, 'string', "date is not a string");
        assert.ok(point.articleCount >= 0, "articleCount is negative");
      });
    }
  },

  // --- GET /api/trending ---
  {
    suite: "GET /api/trending",
    testName: "Returns trending keywords for a timeframe",
    run: async () => {
      const res = await api.get('/api/trending', {
        params: { timeframe: '24h', limit: 10 }
      });
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      assert.strictEqual(res.data.timeframe, '24h', "Timeframe mismatch");
      assert.ok(Array.isArray(res.data.keywords), "keywords is not an array");
      assert.ok(res.data.keywords.length <= 10, "keywords length exceeds limit");

      res.data.keywords.forEach((entry: any) => {
        assert.ok(entry.keyword !== undefined, "Missing keyword in entry");
        assert.ok(entry.count !== undefined, "Missing count in entry");
        assert.strictEqual(typeof entry.keyword, 'string', "keyword is not a string");
        assert.strictEqual(typeof entry.count, 'number', "count is not a number");
        assert.ok(entry.count >= 0, "count is negative");
      });
    }
  },

  // --- GET /api/sources ---
  {
    suite: "GET /api/sources",
    testName: "Returns list of sources along with article counts",
    run: async () => {
      const res = await api.get('/api/sources', {
        params: { limit: 20, timeframe: '30d' }
      });
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      assert.ok(Array.isArray(res.data.data), "data is not an array");
      assert.ok(res.data.data.length > 0, "data is empty");

      const first = res.data.data[0];
      assert.ok(first.id !== undefined, "Missing id in first source");
      assert.ok(first.name !== undefined, "Missing name in first source");
      assert.ok(first.url !== undefined, "Missing url in first source");
      assert.ok(first.articleCount !== undefined, "Missing articleCount in first source");
      assert.ok(first.latestPublishedAt !== undefined, "Missing latestPublishedAt in first source");
      assert.strictEqual(typeof first.id, 'string', "id is not a string");
      assert.strictEqual(typeof first.name, 'string', "name is not a string");
      assert.strictEqual(typeof first.url, 'string', "url is not a string");
      assert.strictEqual(typeof first.articleCount, 'number', "articleCount is not a number");
      assert.ok(first.articleCount >= 0, "articleCount is negative");
    }
  }
];
