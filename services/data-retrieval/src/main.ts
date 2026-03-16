import express from "express";
import serverless from "serverless-http";
import path from "path";
import { retrievalRouter } from "./routes/retrieval.routes";
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import cors from "cors";

export const app = express();
const PORT = process.env.PORT || 8000;
const shouldListen = process.env.JEST_WORKER_ID === undefined;

app.use(express.json());
app.use(cors());

// Safely resolve the path to the swagger file from the root directory
const swaggerPath = path.join(process.cwd(), 'src', 'swagger', 'swagger.yaml');

// Serve the raw OpenAPI document for clients or documentation tools
app.get("/api/swagger.yaml", (req, res) => {
  res.sendFile(swaggerPath);
});

// Health check — important for Docker/CI/Lambda
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "data-retrieval" });
});

app.use("/api", retrievalRouter);

// Set up Swagger UI for API documentation
const swaggerDocument = YAML.load(swaggerPath);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// --- THE LAMBDA HANDLER ---
export const handler = serverless(app);

// --- LOCAL SERVER LOGIC ---
// Only start the local listener if NOT in AWS Lambda
export const server = (!process.env.AWS_EXECUTION_ENV && shouldListen)
  ? app.listen(PORT, () => {
      console.log(`Data Retrieval service running on port ${PORT}`);
    })
  : null;