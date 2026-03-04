import express from "express";
import { retrievalRouter } from "./routes/collection.routes";

export const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.json());

// Health check — important for Docker/CI
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "data-retrieval" });
});

app.use("/api", retrievalRouter);

// Export the server so tests can close it and avoid open handle warnings
export const server = app.listen(PORT, () => {
  console.log(`Data Retrieval service running on port ${PORT}`);
});
