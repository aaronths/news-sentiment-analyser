import { api } from './../api-client';

describe("Chart Tests", () => {
  describe("GET /api/chart/sentiment/trend", () => {
    it("Returns Chart.js json for a keyword", async () => {
      const res = await api.get('/api/chart/sentiment/trend', {
        params: { keyword: 'inflation', sourceId: 'guardian', timeframe: '7d' }
      });

      expect(res.status).toBe(200);
      expect(res.data.chartType).toBe('line');
      expect(Array.isArray(res.data.labels)).toBe(true);
      expect(Array.isArray(res.data.datasets)).toBe(true);
      expect(res.data.datasets).toHaveLength(2);
      expect(res.data.datasets[0].label).toBe('Average Sentiment');
      expect(res.data.datasets[1].label).toBe('Article Count');

      expect(res.data.meta.keyword).toBe('inflation');
      expect(res.data.meta.sourceId).toBe('guardian');
      expect(res.data.meta.timeframe).toBe('7d');
    });
  });

  describe("GET /api/chart/sources/compare", () => {
    it("Returns Chart.js json for a keyword", async () => {
      const res = await api.get('/api/chart/sources/compare', {
        params: { keyword: 'inflation', sourceIds: 'guardian,nyt', timeframe: '7d' }
      });

      expect(res.status).toBe(200);
      expect(res.data.chartType).toBe('bar');
      expect(res.data.labels).toEqual(expect.arrayContaining(['The Guardian', 'nyt']));
      expect(res.data.labels).toHaveLength(2);
      expect(Array.isArray(res.data.datasets)).toBe(true);
      expect(res.data.datasets).toHaveLength(2);
      expect(res.data.datasets[0].label).toBe('Average Sentiment');
      expect(res.data.datasets[1].label).toBe('Article Count');

      expect(res.data.meta.keyword).toBe('inflation');
      expect(res.data.meta.timeframe).toBe('7d');
    });
  });

  describe("GET /api/chart/mentions/monthly", () => {
    it("Returns Chart.js json for a keyword", async () => {
      const res = await api.get('/api/chart/mentions/monthly', {
        params: { keyword: 'Trump', year: 2025, sourceLimit: 5 }
      });

      expect(res.status).toBe(200);
      expect(res.data.chartType).toBe('bar');
      expect(res.data.labels).toEqual([
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
      ]);
      expect(Array.isArray(res.data.datasets)).toBe(true);
      expect(res.data.datasets).toHaveLength(0);

      expect(res.data.meta.keyword).toBe('Trump');
      expect(res.data.meta.year).toBe(2025);
      expect(res.data.meta.sourceLimit).toBe(5);
      expect(res.data.meta.sourcesCompared).toBe(0);
      expect(res.data.meta.totalMentions).toBe(0);
    });
  });

  describe("GET /api/chart/mentions/monthly.png", () => {
    it("Returns a PNG image for monthly mentions", async () => {
      const res = await api.get('/api/chart/mentions/monthly.png', {
        params: { keyword: 'Trump', year: 2026 },
        responseType: 'arraybuffer' // Critical for handling image data
      });

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('image/png');
    });

    it("Returns 400 if missing keyword", async () => {
      const request = api.get('/api/chart/mentions/monthly.png', {
        params: { year: 2026 },
        responseType: 'arraybuffer'
      });

      await expect(request).rejects.toMatchObject({
        response: { status: 400 }
      });
    });

    it("Returns 400 if parameter is invalid", async () => {
      const request = api.get('/api/chart/mentions/monthly.png', {
        params: { keyword: 'Trump', year: 'not-a-number' },
        responseType: 'arraybuffer'
      });

      await expect(request).rejects.toMatchObject({
        response: { status: 400 }
      });
    });
  });
});