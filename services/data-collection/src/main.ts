import express from "express";
import { loadEnvironment } from "./config/load-environment";
import { collectionRouter } from "./routes/collection.routes";

loadEnvironment();

export const app = express();
const PORT = process.env.DATA_COLLECTION_PORT || process.env.PORT || 8000;
const shouldListen = process.env.JEST_WORKER_ID === undefined;

app.use(express.json());

// Health check — important for Docker/CI
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "data-collection" });
});

app.use("/api", collectionRouter);

// Avoid binding a real port inside Jest; supertest can run directly against the app.
export const server = shouldListen
  ? app.listen(PORT, () => {
      console.log(`Data Collection service running on port ${PORT}`);
    })
  : null;
