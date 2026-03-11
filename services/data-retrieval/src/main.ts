import express from "express";
import { retrievalRouter } from "./routes/retrieval.routes";

export const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.json());

// Serve the raw OpenAPI document for clients or documentation tools
app.get("/api/swagger.yaml", (req, res) => {
  res.sendFile("swagger/swagger.yaml", { root: __dirname });
});

// Health check — important for Docker/CI
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "data-retrieval" });
});

app.use("/api", retrievalRouter);

// Export the server so tests can close it and avoid open handle warnings
export const server = app.listen(PORT, () => {
  console.log(`Data Retrieval service running on port ${PORT}`);
});