# news-sentiment-analyser

MVP for two modes:

1. local ingest to collect and preprocess general news data, then upload it to S3
2. runtime keyword search and VADER sentiment ranking through a Lambda-style API

## Current architecture

### Data Ingestion (collection and preprocessing)

Location: [services/data-collection](services/data-collection)

- collects general news articles from configured outlets
- supports provider adapters for first-party APIs and RSS feeds
- current first-party API adapters: The Guardian Search API, New York Times Top Stories API, New York Times Most Popular API
- current RSS adapters include BBC, Reuters, ABC (AU), and SBS
- preprocesses the raw payload into one clean schema
- writes local snapshots to [data/raw-articles.json](data/raw-articles.json) and [data/clean-articles.json](data/clean-articles.json)
- uses local mock file storage until s3 is setup
- uploads both files to S3 when `NEWS_DATA_STORAGE_MODE=s3` and `NEWS_DATA_BUCKET` is configured
- defaults to sample fallback data when API keys or API URLs are still placeholders

Primary local command:

- `npm run ingest`

Optional collection API remains available for testing:

- `GET /health`
- `GET /api/sources`
- `GET /api/articles/raw?sourceId=guardian&limit=10`
- `POST /api/collect`

### Data Retrieval Service

Location: [services/data-retrieval](services/data-retrieval)

The TypeScript-based data-retrieval service replaces the Python runtime-api.  It
implements the API described in `src/swagger/swagger.yaml` and exposes the
specification directly at `/api/swagger.yaml` for documentation or client
generation.

- reads the clean article pool from S3 at runtime
- falls back to the local clean JSON file if S3 is not configured or unavailable
- filters by user keyword
- runs `vaderSentiment` over the matched articles
- returns a JSON response ranking outlets from most positive to most negative

Expected query parameters:

- `keyword` required
- `sourceId` optional
- `limit` optional article preview count

### Chart generation

Location: [services/data-retrieval](services/data-retrieval)

- uses [services/data-retrieval/run-charts.js](services/data-retrieval/run-charts.js) for repeatable chart generation
- writes PNG and JSON outputs to [services/data-retrieval/chart-output](services/data-retrieval/chart-output)
- can run against local clean data or the configured S3 clean object

Commands:

- `cd services/data-retrieval && npm run charts:run`
- `cd services/data-retrieval && node run-charts.js`
- `cd services/data-retrieval && npm run charts:run -- trump --mode local --input ../../data/clean-articles.json`

Notes:

- edit the config block at the top of [services/data-retrieval/run-charts.js](services/data-retrieval/run-charts.js) to change the default keyword, year, timeframe, dimensions, or output toggles
- use `dataSourceMode = "local"` when you want the runner to use your local [data/clean-articles.json](data/clean-articles.json) edits directly
- use `dataSourceMode = "s3"` when you want the runner to use the configured S3 bucket and clean key


## Data model

The clean article schema includes:

- `id`
- `sourceId`
- `sourceName`
- `title`
- `body`
- `summary`
- `publishedAt`
- `collectedAt`
- `url`
- `keywordTokens`
- `sentimentText`

## Environment setup

Copy [.env.example](.env.example) to `.env` and replace placeholders.

Important values:

- `GUARDIAN_API_KEY`
- `NYT_NEWS_API_KEY`
- `NYT_NEWS_API_URL`
- `NYT_MOST_POPULAR_API_URL`
- `BBC_NEWS_RSS_URL`
- `REUTERS_RSS_URL`
- `ABC_NEWS_RSS_URL`
- `SBS_NEWS_RSS_URL`
- `NEWS_DATA_STORAGE_MODE`
- `AWS_REGION`
- `NEWS_DATA_BUCKET`
- `NEWS_DATA_RAW_KEY`
- `NEWS_DATA_CLEAN_KEY`

## Running data collection (ingest)

The data-collection service supports two modes:

- **local-file** (default / dev): writes data to `data/raw-articles.json` and `data/clean-articles.json`
- **s3** (prod): writes both files to S3 using the configured bucket/key

### Install

```bash
cd services/data-collection
npm install
```

### Run in dev (local-file mode)

```bash
cd services/data-collection
npm run dev
```

This runs the ingestion pipeline with:
- `NEWS_DATA_STORAGE_MODE=local-file`
- `INGEST_INTERVAL_MS` and other `.env` values govern run frequency

### Run in prod (S3 mode)

```bash
cd services/data-collection
npm run prod
```

This runs the ingestion pipeline with:
- `NEWS_DATA_STORAGE_MODE=s3`
- `NEWS_DATA_BUCKET` (required)

### Optional ingest flags (use with `npm run ingest -- ...`)

- **`--perSource`**: limit articles per source
- **`--sourceIds`**: comma-separated list of source IDs to run
- **`--pages`**: fetch additional pages when supported
- **`--backfill`**: larger default limits to pull deeper history

### Environment variables (some key ones)

- `NEWS_DATA_STORAGE_MODE` - `local-file` or `s3`
- `NEWS_DATA_BUCKET` - s3 bucket name (required in s3 mode)
- `INGEST_INTERVAL_MS` - milliseconds between automatic runs (omit to run once)
- `INGEST_MAX_ITERATIONS` - stop after N runs when using `INGEST_INTERVAL_MS`

---

## Running data retrieval (runtime API)

### Install

```bash
cd services/data-retrieval
npm install
```

### Run in dev (local-file mode)

```bash
cd services/data-retrieval
npm run dev
```

This runs the service with `NEWS_DATA_STORAGE_MODE=local-file` and reads `data/clean-articles.json`.

### Run in prod (S3 mode)

```bash
cd services/data-retrieval
npm run prod
```

This runs the service with `NEWS_DATA_STORAGE_MODE=s3` and expects:
- `NEWS_DATA_BUCKET` set
- `NEWS_DATA_CLEAN_KEY` pointing to the clean JSON object (default: `clean/clean-articles.json`)

### Runtime API usage

Example request:

- `GET /api/articles?keyword=election&limit=10`

Response includes:

- `keyword`
- `totalMatches`
- `rankings`
- `articles`

### Lambda deployment

The `handler` is exported from `services/data-retrieval/src/main.ts`. You can deploy it behind Lambda Function URL or API Gateway.

---

## Testing Runner API

Location: [services/testing](services/testing)

This service exposes an API that runs integration test suites on demand. You can hit a route to execute one suite or all suites, and it returns pass/fail output in JSON.

Before running it, set these values in your env file:

- `TARGET_API_URL` (the deployed or local API base URL to test)
- `X_API_KEY` (API key expected by protected routes)
- `TESTING_PORT` (optional, defaults to `8002`)

### Install and run locally

```bash
cd services/testing
npm install
npm run dev
```

### Endpoints

- `GET /health`
- `GET /health/target`
- `GET /api/tests/suites`
- `GET /api/tests/run?suite=sentiment&env=local`
- `GET /api/tests/run/sentiment?env=dev`
- `GET /docs`

Notes:

- `suite` defaults to `all`
- `env` must be one of `local`, `dev`, or `prod`
- test suites are configured in `services/testing/src/config/test-suites.ts`
- add more suites there as new test files are made

## Frontend flow

Open [frontend/index.html](frontend/index.html) in a browser or serve the folder with a simple static file server.

Provide the deployed runtime API URL, enter a keyword, and submit.

## Swagger
Access swagger locally after running data-retrieval on `/docs`

Testing service also exposes its own Swagger docs after running `services/testing`:

- `http://localhost:8002/docs`
- `http://localhost:8002/api/swagger.yaml`

# Docker Setup

## Prerequisites
 - Docker
 - Valid API keys for The Guardian and The New York Times (available on request)

## Setup & Install
Clone the repo:
- `git clone git@github.com:aaronths/news-sentiment-analyser.git`
- `cd news-sentiment-analyser`

Configure environment variables:
Create a `.env` file in the root directory and have it include:
```
# API Keys
GUARDIAN_API_KEY=your-guardian-api-key
NYT_NEWS_API_KEY=your-nyt-news-api-key

# Local ingest controls
INGEST_PER_SOURCE=50
INGEST_SOURCE_IDS=guardian,nyt
# Set an interval to keep ingest running (milliseconds). Leave undefined to run once.
INGEST_INTERVAL_MS=60000

# Service Configuration
NEWS_DATA_STORAGE_MODE=local-file
DATA_COLLECTION_PORT=8000
DATA_RETRIEVAL_PORT=8001
```
Using these default `.env` parameters, the data collection service will run every minute.

To build the images and start the service, run in the root directory:
`docker-compose up --build` this runs the collection and retrieval concurrently.

**Architecture Note:** the services use a Shared Docker Volume. Best practice is to let the collection service run for a few minutes to populate the volume, then you can stop it and run retrieval independently. Data will persist in the volume until manually cleared. Although, running them together will still work.

To run Collection separately: `docker-compose up collection`

To run Retrieval separately: `docker-compose up retrieval`

To stop services: `docker-compose down` or `Ctrl + C`

To clear all data/volumes: `docker-compose down -v`

## Recommended initial testing
| Service |  Endpoint  | Description |
|:-----|:--------:|------:|
| Retrieval API   | [http://localhost:8001/api/articles](http://localhost:8001/api/articles) | Query the collected articles (e.g. `?keyword=trump`) |
| Swagger UI |  [http://localhost:8001/docs](http://localhost:8001/docs) | API documentation |

## Notes

- [services/data-retrieval](services/data-retrieval) is a legacy MVP artifact from the earlier split-service version.
- the collection layer now uses provider-based adapters so adding another outlet only requires a new source config and, if needed, one adapter mapper in [services/data-collection/src/services/source-clients.ts](services/data-collection/src/services/source-clients.ts)
- For larger datasets, the runtime layer should move from S3 JSON scanning to an indexed store such as DynamoDB or OpenSearch.
