import express from "express";
import serverless from "serverless-http";
import { loadEnvironment } from "./config/load-environment";
import { collectionRouter } from "./routes/collection.routes";

// Load local .env files (AWS Lambda will use its own environment variables)
loadEnvironment();

export const app = express();
const PORT = process.env.DATA_COLLECTION_PORT || process.env.PORT || 8000;
const shouldListen = process.env.JEST_WORKER_ID === undefined;

app.use(express.json());

// Health check — important for Docker/CI/Lambda
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "data-collection" });
});

app.use("/api", collectionRouter);

// --- THE LAMBDA HANDLER ---
// This is what AWS will call when a request comes in
export const handler = serverless(app);

// --- LOCAL SERVER LOGIC ---
// Only start the Express server if we are running locally (not in AWS Lambda)
// AWS sets the AWS_EXECUTION_ENV variable automatically, so we can use it as a flag.
if (!process.env.AWS_EXECUTION_ENV && shouldListen) {
  app.listen(PORT, () => {
    console.log(`Data Collection service running locally on port ${PORT}`);
  });
}