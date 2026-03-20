import express from "express";
import serverless from "serverless-http";
import path from "path";
import { loadEnvironment } from "./config/load-environment";
import { retrievalRouter } from "./routes/retrieval.routes";
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import cors from "cors";

loadEnvironment();

export const app = express();
const PORT = process.env.DATA_RETRIEVAL_PORT || process.env.PORT || 8001;
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
const swaggerUiOptions = {
  customCssUrl: 'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css',
  customJs: [
    'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-bundle.js',
    'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-standalone-preset.js'
  ]
};
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, swaggerUiOptions));

// --- THE LAMBDA HANDLER ---
export const handler = serverless(app);

// --- LOCAL SERVER LOGIC ---
// Only start the local listener if NOT in AWS Lambda
export const server = (!process.env.AWS_EXECUTION_ENV && shouldListen)
  ? app.listen(PORT, () => {
      console.log(`Data Retrieval service running on port ${PORT}`);
    })
  : null;


  