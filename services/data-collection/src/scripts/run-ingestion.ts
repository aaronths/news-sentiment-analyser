import { loadEnvironment } from "../config/load-environment";

// Important: load environment variables before importing modules that
// read `process.env` at module-evaluation time (e.g. `news-sources.ts`).
loadEnvironment();

// Import pipeline after environment is loaded so configured API keys are
// available during module initialization.
import { runIngestionPipeline } from "../services/ingestion-pipeline.service";

const parseSourceIds = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }

  const sourceIds = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  return sourceIds.length > 0 ? sourceIds : undefined;
};

const parseNumber = (value: string | undefined, fallback?: number) => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
  const perSource = parseNumber(process.env.INGEST_PER_SOURCE);
  const sourceIds = parseSourceIds(process.env.INGEST_SOURCE_IDS);
  const pages = parseNumber(process.env.INGEST_PAGES, 1) ?? 1;
  const intervalMs = parseNumber(process.env.INGEST_INTERVAL_MS);
  const maxIterations = parseNumber(process.env.INGEST_MAX_ITERATIONS);

  const runOnce = async () => {
    const summary = await runIngestionPipeline({
      perSource,
      sourceIds,
      pages,
    });

    console.log(JSON.stringify(summary, null, 2));
  };

  const runOnceSafe = async () => {
    try {
      await runOnce();
    } catch (error) {
      const message = error instanceof Error ? error.stack ?? error.message : String(error);
      console.error(`[ingest] run failed: ${message}`);
      if (!intervalMs || intervalMs <= 0) {
        throw error;
      }
    }
  };

  if (intervalMs && intervalMs > 0) {
    let iteration = 0;
    const shouldContinue = () =>
      !maxIterations || (maxIterations > 0 && iteration < maxIterations);

    while (shouldContinue()) {
      iteration += 1;
      console.log(`\n[ingest] iteration ${iteration} starting at ${new Date().toISOString()}`);
      await runOnceSafe();

      if (!shouldContinue()) {
        break;
      }

      console.log(`[ingest] sleeping for ${intervalMs}ms`);
      await delay(intervalMs);
    }

    console.log("[ingest] finished iterations");
  } else {
    await runOnce();
  }
};

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
