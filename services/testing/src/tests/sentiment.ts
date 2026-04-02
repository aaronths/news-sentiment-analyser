import assert from "assert";
import { api } from "../api-client";


export const sentimentTests = [
  // --Health Checks--
  {
    suite: "System Health",
    testName: "Health Check API should return 200 OK",
    run: async () => {
      // 1. Make the API call
      const res = await api.get(`/health`);
      // 2. Assert the result (if it fails, it throws an error and gets caught below)
      assert.strictEqual(res.status, 200, `Expected status 200, got ${res.status}`);
    }
  },

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
      assert.ok(res.data.averageSentiment !== undefined, "Missing averageSentiment in response");
    }
  },

  // --- GET /api/chart/mentions/monthly.png ---
  {
    suite: "GET /api/chart/mentions/monthly.png",
    testName: "Returns a PNG image for monthly mentions",
    run: async () => {
      const res = await api.get('/api/chart/mentions/monthly.png', {
        params: { keyword: 'Trump', year: 2026 },
        responseType: 'arraybuffer'
      });
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      assert.strictEqual(res.headers['content-type'], 'image/png');
    }
  },
  {
    suite: "GET /api/chart/mentions/monthly.png",
    testName: "Returns 400 if missing keyword",
    run: async () => {
      try {
        await api.get('/api/chart/mentions/monthly.png', {
          params: { year: 2026 },
          responseType: 'arraybuffer'
        });
        assert.fail("Request succeeded but should have failed with 400");
      } catch (error: any) {
        assert.strictEqual(error.response?.status, 400, `Expected 400, got ${error.response?.status}`);
      }
    }
  },
  {
    suite: "GET /api/chart/mentions/monthly.png",
    testName: "Returns 400 if parameter is invalid",
    run: async () => {
      try {
        await api.get('/api/chart/mentions/monthly.png', {
          params: { keyword: 'Trump', year: 'not-a-number' },
          responseType: 'arraybuffer'
        });
        assert.fail("Request succeeded but should have failed with 400");
      } catch (error: any) {
        assert.strictEqual(error.response?.status, 400, `Expected 400, got ${error.response?.status}`);
      }
    }
  }
];