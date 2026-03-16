import express from "express";
import { retrievalRouter } from "./routes/retrieval.routes";
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';

export const app = express();
const PORT = process.env.PORT || 8000;
const shouldListen = process.env.JEST_WORKER_ID === undefined;

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

// Set up Swagger UI for API documentation
const swaggerDocument = YAML.load('./src/swagger/swagger.yaml');
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Avoid binding a real port inside Jest; supertest can run directly against the app.
export const server = shouldListen
  ? app.listen(PORT, () => {
      console.log(`Data Retrieval service running on port ${PORT}`);
    })
  : null;