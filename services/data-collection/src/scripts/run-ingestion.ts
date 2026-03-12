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

const main = async () => {
  const perSource = process.env.INGEST_PER_SOURCE
    ? Number.parseInt(process.env.INGEST_PER_SOURCE, 10)
    : undefined;
  const sourceIds = parseSourceIds(process.env.INGEST_SOURCE_IDS);

  const summary = await runIngestionPipeline({
    perSource,
    sourceIds,
  });

  console.log(JSON.stringify(summary, null, 2));
};

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
