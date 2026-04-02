import { api } from './../api-client';

describe("Chart Tests", () => {
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