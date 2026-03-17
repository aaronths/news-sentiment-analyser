import { NEWS_SOURCES, isSourceConfigured } from "./news-sources";

// The default set of source IDs used for ingestion when the user doesn't
// explicitly specify a subset. By default, we ingest from all configured sources.
export const DEFAULT_INGEST_SOURCE_IDS = NEWS_SOURCES.filter(isSourceConfigured).map(
  (source) => source.id,
);

// The default number of articles to fetch per source when running ingestion.
// This can be overridden via CLI args (recommended) or env vars as a fallback.
export const DEFAULT_INGEST_PER_SOURCE = 100;

// The default number of pages to fetch per source.
// Only sources with explicit pagination support (like Guardian) honor this.
export const DEFAULT_INGEST_PAGES = 20;

// Backfill mode uses larger defaults to try to fetch older data by paging further.
export const BACKFILL_INGEST_PER_SOURCE = 250;
export const BACKFILL_INGEST_PAGES = 10;
