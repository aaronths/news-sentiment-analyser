import assert from "assert";
import { api } from "../api-client";

export const chartTests = [
  // --- GET /api/chart/sentiment/trend ---
  {
    suite: "GET /api/chart/sentiment/trend",
    testName: "Returns Chart.js json for a keyword",
    run: async () => {
      const res = await api.get('/api/chart/sentiment/trend', {
        params: { keyword: 'inflation', sourceId: 'guardian', timeframe: '7d' }
      });
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      assert.strictEqual(res.data.chartType, 'line', "chartType mismatch");
      assert.ok(Array.isArray(res.data.labels), "labels is not an array");
      assert.ok(Array.isArray(res.data.datasets), "datasets is not an array");
      assert.strictEqual(res.data.datasets.length, 2, "datasets length is not 2");
      assert.strictEqual(res.data.datasets[0].label, 'Average Sentiment', "Dataset 0 label mismatch");
      assert.strictEqual(res.data.datasets[1].label, 'Article Count', "Dataset 1 label mismatch");

      assert.strictEqual(res.data.meta.keyword, 'inflation', "meta.keyword mismatch");
      assert.strictEqual(res.data.meta.sourceId, 'guardian', "meta.sourceId mismatch");
      assert.strictEqual(res.data.meta.timeframe, '7d', "meta.timeframe mismatch");
    }
  },

  // --- GET /api/chart/sources/compare ---
  {
    suite: "GET /api/chart/sources/compare",
    testName: "Returns Chart.js json for comparing sources",
    run: async () => {
      const res = await api.get('/api/chart/sources/compare', {
        params: { keyword: 'inflation', sourceIds: 'guardian,nyt', timeframe: '7d' }
      });
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      assert.strictEqual(res.data.chartType, 'bar', "chartType mismatch");
      assert.ok(Array.isArray(res.data.labels), "labels is not an array");
      assert.strictEqual(res.data.labels.length, 2, "labels length is not 2");
      assert.ok(res.data.labels.includes('The Guardian'), "The Guardian not in labels");
      assert.ok(res.data.labels.includes('nyt'), "nyt not in labels");
      assert.ok(Array.isArray(res.data.datasets), "datasets is not an array");
      assert.strictEqual(res.data.datasets.length, 2, "datasets length is not 2");
      assert.strictEqual(res.data.datasets[0].label, 'Average Sentiment', "Dataset 0 label mismatch");
      assert.strictEqual(res.data.datasets[1].label, 'Article Count', "Dataset 1 label mismatch");

      assert.strictEqual(res.data.meta.keyword, 'inflation', "meta.keyword mismatch");
      assert.strictEqual(res.data.meta.timeframe, '7d', "meta.timeframe mismatch");
    }
  },

  // --- GET /api/chart/mentions/monthly ---
  {
    suite: "GET /api/chart/mentions/monthly",
    testName: "Returns Chart.js json for monthly mentions",
    run: async () => {
      const res = await api.get('/api/chart/mentions/monthly', {
        params: { keyword: 'Trump', year: 2025, sourceLimit: 5 }
      });
      assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
      assert.strictEqual(res.data.chartType, 'bar', "chartType mismatch");
      const expectedLabels = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      assert.deepStrictEqual(res.data.labels, expectedLabels, "labels mismatch");
      assert.ok(Array.isArray(res.data.datasets), "datasets is not an array");
      assert.strictEqual(res.data.datasets.length, 0, "datasets length is not 0");

      assert.strictEqual(res.data.meta.keyword, 'Trump', "meta.keyword mismatch");
      assert.strictEqual(res.data.meta.year, 2025, "meta.year mismatch");
      assert.strictEqual(res.data.meta.sourceLimit, 5, "meta.sourceLimit mismatch");
      assert.strictEqual(res.data.meta.sourcesCompared, 0, "meta.sourcesCompared mismatch");
      assert.strictEqual(res.data.meta.totalMentions, 0, "meta.totalMentions mismatch");
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
      assert.strictEqual(res.headers['content-type'], 'image/png', "content-type is not image/png");
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
