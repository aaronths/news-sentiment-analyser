import assert from "assert";
import { api } from "../api-client";

export const sentimentTests = [
  // --Health Checks--
  {
    suite: "System Health",
    testName: "Health Check API should return 200 OK",
    run: async () => {
      const res = await api.get(`/health`);
      assert.strictEqual(res.status, 200, `Expected status 200, got ${res.status}`);
    }
  },

  // --- GET /api/sentiment ---
  {
    suite: "GET /api/sentiment",
    testName: "should return sentiment scores for 'economy'",
    run: async () => {
      const res = await api.get('/api/sentiment', {
        params: { keyword: 'economy', timeframe: '7d' }
      });
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      assert.strictEqual(res.data.keyword, "economy");
      assert.ok(!res.data.hasOwnProperty('source'), "Response should not have 'source' property");
      assert.ok(res.data.averageSentiment !== undefined, "Missing averageSentiment in response");
    }
  },

  {
    suite: "GET /api/sentiment",
    testName: "should use correct source",
    run: async () => {
      const res = await api.get('/api/sentiment', {
        params: { keyword: 'economy', sourceId: 'guardian', timeframe: '7d' }
      });
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      assert.strictEqual(res.data.keyword, "economy");
      assert.strictEqual(res.data.sourceId, "guardian");
      assert.ok(res.data.averageSentiment !== undefined, "Missing averageSentiment in response");
    }
  },

  // --- GET /api/sentiment/compare ---
  {
    suite: "GET /api/sentiment/compare",
    testName: "should compare sentiment between two sources",
    run: async () => {
      const res = await api.get('/api/sentiment/compare', {
        params: { keyword: 'inflation', sourceIds: 'guardian,nyt', timeframe: '7d' }
      });
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      assert.strictEqual(res.data.keyword, 'inflation');
      assert.strictEqual(res.data.timeframe, '7d');
      assert.strictEqual(res.data.sourcesCompared, 2);
      assert.ok(Array.isArray(res.data.comparisons), "comparisons is not an array");
      assert.strictEqual(res.data.comparisons.length, 2, "comparisons length is not 2");

      res.data.comparisons.forEach((comparison: any) => {
        assert.ok(comparison.sourceId !== undefined, "Missing sourceId in comparison");
        assert.ok(comparison.sourceName !== undefined, "Missing sourceName in comparison");
        assert.ok(comparison.averageSentiment !== undefined, "Missing averageSentiment in comparison");
        assert.ok(comparison.distribution !== undefined, "Missing distribution in comparison");
        assert.ok(comparison.distribution.positive !== undefined, "Missing positive in distribution");
        assert.ok(comparison.distribution.neutral !== undefined, "Missing neutral in distribution");
        assert.ok(comparison.distribution.negative !== undefined, "Missing negative in distribution");
      });

      const sourceIds = res.data.comparisons.map((c: any) => c.sourceId);
      assert.ok(sourceIds.includes('guardian'), "guardian not in comparisons");
      assert.ok(sourceIds.includes('nyt'), "nyt not in comparisons");
    }
  },

  // --- GET /api/sentiment/trend ---
  {
    suite: "GET /api/sentiment/trend",
    testName: "should return sentiment trends over time",
    run: async () => {
      const res = await api.get('/api/sentiment/trend', {
        params: { keyword: 'inflation', timeframe: '30d' }
      });
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      assert.strictEqual(res.data.keyword, 'inflation');
      assert.strictEqual(res.data.timeframe, '30d');
      assert.ok(Array.isArray(res.data.dataPoints), "dataPoints is not an array");
      assert.ok(res.data.dataPoints.length >= 0, "dataPoints length is negative");

      res.data.dataPoints.forEach((dp: any) => {
        assert.ok(dp.date !== undefined, "Missing date in dataPoint");
        assert.ok(dp.averageSentiment !== undefined, "Missing averageSentiment in dataPoint");
        assert.ok(dp.articleCount !== undefined, "Missing articleCount in dataPoint");
      });
    }
  }
];