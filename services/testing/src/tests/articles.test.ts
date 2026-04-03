import { api } from './../api-client';

describe("Articles Tests", () => {
  describe("GET /api/articles", () => {
    it("Return articles for a valid keyword", async () => {
      const res = await api.get('/api/articles', {
        params: { keyword: 'inflation', limit: 5 }
      });

      console.log("DEBUG DATA TYPE:", typeof res.data.articles);
      console.log("DEBUG DATA CONTENT:", JSON.stringify(res.data.articles, null, 2));

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('totalMatches');
      expect(res.data).toHaveProperty('articles');
    });
  });

  describe("GET /api/articles/metadata", () => {
    it("Returns metadata list for a keyword without pagination", async () => {
      const res = await api.get('/api/articles/metadata', {
        params: { keyword: 'Inflation' }
      });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.data)).toBe(true);
      expect(res.data.data.length).toBeGreaterThanOrEqual(0);

      // Validate structure when items are present.
      if (res.data.data.length > 0) {
        const first = res.data.data[0];
        expect(first).toHaveProperty('id');
        expect(first).toHaveProperty('title');
        expect(first).toHaveProperty('source');
        expect(first).toHaveProperty('publishedAt');
      }
    });
  });

  describe("GET /api/trend", () => {
    it("Returns trend data for a keyword", async () => {
      const res = await api.get('/api/trend', {
        params: { keyword: 'inflation', timeframe: '7d', sourceId: 'nyt' }
      });

      expect(res.status).toBe(200);
      expect(res.data.keyword).toBe('inflation');
      expect(res.data.sourceId).toBe('nyt');
      expect(res.data.timeframe).toBe('7d');
      expect(res.data.totalArticles).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(res.data.dataPoints)).toBe(true);
      expect(res.data.dataPoints.length).toBeGreaterThan(0);

      res.data.dataPoints.forEach((point: any) => {
        expect(point).toHaveProperty('date');
        expect(point).toHaveProperty('articleCount');
        expect(typeof point.date).toBe('string');
        expect(point.articleCount).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe("GET /api/trending", () => {
    it("Returns trending keywords for a timeframe", async () => {
      const res = await api.get('/api/trending', {
        params: { timeframe: '24h', limit: 10 }
      });

      expect(res.status).toBe(200);
      expect(res.data.timeframe).toBe('24h');
      expect(Array.isArray(res.data.keywords)).toBe(true);
      expect(res.data.keywords.length).toBeLessThanOrEqual(10);

      res.data.keywords.forEach((entry: any) => {
        expect(entry).toHaveProperty('keyword');
        expect(entry).toHaveProperty('count');
        expect(typeof entry.keyword).toBe('string');
        expect(typeof entry.count).toBe('number');
        expect(entry.count).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe("GET /api/sources", () => {
    it("Returns list of sources along with article counts", async () => {
      const res = await api.get('/api/sources', {
        params: { limit: 20, timeframe: '30d' }
      });

      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.data)).toBe(true);
      expect(res.data.data.length).toBeGreaterThan(0);

      // Validate structure of the source entry
      const first = res.data.data[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('url');
      expect(first).toHaveProperty('articleCount');
      expect(first).toHaveProperty('latestPublishedAt');
      expect(typeof first.id).toBe('string');
      expect(typeof first.name).toBe('string');
      expect(typeof first.url).toBe('string');
      expect(typeof first.articleCount).toBe('number');
      expect(first.articleCount).toBeGreaterThanOrEqual(0);
    });
  });
});