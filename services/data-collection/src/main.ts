import express from "express";
import { loadEnvironment } from "./config/load-environment";
import { collectionRouter } from "./routes/collection.routes";

loadEnvironment();

export const app = express();
const PORT = process.env.DATA_COLLECTION_PORT || process.env.PORT || 8000;

app.use(express.json());

// Health check — important for Docker/CI
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "data-collection" });
});

app.use("/api", collectionRouter);

// Export the server so tests can close it and avoid open handle warnings
export const server = app.listen(PORT, () => {
  console.log(`Data Collection service running on port ${PORT}`);
});
