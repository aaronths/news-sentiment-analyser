import { api } from './../api-client';

describe("News Sentiment API - Integration Tests", () => {
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

    // it("Returns 401 if API key is missing", async () => {
    //   const request = api.get('/api/articles', {
    //     params: { keyword: 'inflation' },
    //     headers: { 'X-API-Key': '' }
    //   });

    //   await expect(request).rejects.toMatchObject({
    //     response: { status: 401 }
    //   });
    // });
  });

  describe("GET /api/sentiment", () => {
    it("should return sentiment scores for 'economy'", async () => {
      const res = await api.get('/api/sentiment', {
        params: { keyword: 'economy', timeframe: '7d' }
      });

      expect(res.status).toBe(200);
      expect(res.data.keyword).toBe("economy");
      expect(res.data).toHaveProperty('averageSentiment');
    });

    // it("Returns 401 if API key is missing", async () => {
    //   const request = api.get('/api/sentiment', {
    //     params: { keyword: 'economy', timeframe: '7d' },
    //     headers: { 'X-API-Key': '' }
    //   });

    //   await expect(request).rejects.toMatchObject({
    //     response: { status: 401 }
    //   });
    // });
  });
});