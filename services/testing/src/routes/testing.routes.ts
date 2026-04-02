import { Router } from "express";
import { listSuites } from "../config/test-suites";
import { runSuite } from "../services/test-runner.service";

export const testingRouter = Router();

testingRouter.get("/suites", (_req, res) => {
  res.json({ suites: listSuites() });
});


testingRouter.get("/run", async (req, res) => {
  const suite = typeof req.query.suite === "string" ? req.query.suite : undefined;
  const environment = typeof req.query.env === "string" ? req.query.env : undefined;

  try {
    process.env.TEST_TARGET_ENV = environment.toLowerCase();
    const result = await runSuite({ suite, environment });
    res.status(result.ok ? 200 : 500).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to run tests.";
    const statusCode = message.includes("already in progress") ? 409 : 400;
    res.status(statusCode).json({ ok: false, error: message });
  }
});
