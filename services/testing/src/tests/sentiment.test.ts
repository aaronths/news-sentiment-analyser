import { api } from './../api-client';

describe("Sentiment Tests", () => {
  describe("GET /api/sentiment", () => {
    it("should return sentiment scores for 'economy'", async () => {
      const res = await api.get('/api/sentiment', {
        params: { keyword: 'economy', timeframe: '7d' }
      });

      expect(res.status).toBe(200);
      expect(res.data.keyword).toBe("economy");
      expect(res.data).not.toHaveProperty('source');
      expect(res.data).toHaveProperty('averageSentiment');
    });

    it("should use correct source", async () => {
      const res = await api.get('/api/sentiment', {
        params: { keyword: 'economy', sourceId: 'guardian', timeframe: '7d' }
      });

      expect(res.status).toBe(200);
      expect(res.data.keyword).toBe("economy");
      expect(res.data.sourceId).toBe("guardian");
      expect(res.data).toHaveProperty('averageSentiment');
    });
  });

  describe("GET /api/sentiment/compare", () => {
    it("should compare sentiment between two sources", async () => {
      const res = await api.get('/api/sentiment/compare', {
        params: { keyword: 'inflation', sourceIds: 'guardian,nyt', timeframe: '7d' }
      });

      expect(res.status).toBe(200);
      expect(res.data.keyword).toBe('inflation');
      expect(res.data.timeframe).toBe('7d');
      expect(res.data.sourcesCompared).toBe(2);
      expect(Array.isArray(res.data.comparisons)).toBe(true);
      expect(res.data.comparisons.length).toBe(2);

      // Validate structure of each comparison
      res.data.comparisons.forEach((comparison: any) => {
        expect(comparison).toHaveProperty('sourceId');
        expect(comparison).toHaveProperty('sourceName');
        expect(comparison).toHaveProperty('averageSentiment');
        expect(comparison).toHaveProperty('distribution');
        expect(comparison.distribution).toHaveProperty('positive');
        expect(comparison.distribution).toHaveProperty('neutral');
        expect(comparison.distribution).toHaveProperty('negative');
      });

      // Validate expected source IDs regardless of response ordering.
      const sourceIds = res.data.comparisons.map((comparison: any) => comparison.sourceId);
      expect(sourceIds).toEqual(expect.arrayContaining(['guardian', 'nyt']));
    });
  });

  describe("GET /api/sentiment/trends", () => {
    it("should return sentiment trends over time", async () => {
      const res = await api.get('/api/sentiment/trend', {
        params: { keyword: 'inflation', timeframe: '30d' }
      });

      expect(res.status).toBe(200);
      expect(res.data.keyword).toBe('inflation');
      expect(res.data.timeframe).toBe('30d');
      expect(Array.isArray(res.data.dataPoints)).toBe(true);
      expect(res.data.dataPoints.length).toBeGreaterThanOrEqual(0);

      // Validate structure of each trend point
      res.data.dataPoints.forEach((dp: any) => {
        expect(dp).toHaveProperty('date');
        expect(dp).toHaveProperty('averageSentiment');
        expect(dp).toHaveProperty('articleCount');
      });
    });
  });
});