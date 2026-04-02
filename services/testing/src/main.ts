import cors from "cors";
import express from "express";
import path from "path";
import swaggerUi from "swagger-ui-express";
import YAML from "yamljs";
import { testingRouter } from "./routes/testing.routes";

export const app = express();
const PORT = Number(process.env.TESTING_PORT || process.env.PORT || 8002);

app.use(cors());
app.use(express.json());
app.set("json spaces", 2);

const swaggerPath = path.join(process.cwd(), "src", "swagger", "swagger.yaml");
const swaggerDocument = YAML.load(swaggerPath);

app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "testing" });
});

// getting health of the target API
app.get("/health/target", async (_req, res) => {
  try {
    const response = await fetch(process.env.TARGET_API_URL || "http://localhost:8000/health");
    const data = await response.json();
    res.status(response.ok ? 200 : 500).json({ status: response.ok ? "ok" : "error", target: data });
  } catch (error) {
    res.status(500).json({ status: "error", error: error instanceof Error ? error.message : "Unknown error" });
  }
});

app.use("/api/tests", testingRouter);

app.listen(PORT, () => {
  console.log(`Testing service running on port ${PORT}`);
});
