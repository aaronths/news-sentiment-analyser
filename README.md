# news-sentiment-analyser

Reshuffled MVP for two modes:

1. local ingest to collect and preprocess general news data, then upload it to S3
2. runtime keyword search and VADER sentiment ranking through a Lambda-style API

## Current architecture

### Local ingest pipeline

Location: [services/data-collection](services/data-collection)

- collects general news articles from configured outlets
- currently need to add the API keys, potentially will be work done on alternative scraping-based collection methods in the future
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

### Runtime API Lambda

Location: [services/runtime-api](services/runtime-api)

- reads the clean article pool from S3 at runtime
- falls back to the local clean JSON file if S3 is not configured or unavailable
- filters by user keyword
- runs `vaderSentiment` over the matched articles
- returns a JSON response ranking outlets from most positive to most negative

Expected query parameters:

- `keyword` required
- `sourceId` optional
- `limit` optional article preview count

### Frontend

Location: [frontend](frontend)

- simple static UI
- accepts the runtime API URL and a keyword
- renders outlet rankings and matching article previews

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
- `ABC_NEWS_API_KEY`
- `ABC_NEWS_API_URL`
- `SBS_NEWS_API_KEY`
- `SBS_NEWS_API_URL`
- `NYT_NEWS_API_KEY`
- `NYT_NEWS_API_URL`
- `NEWS_DATA_STORAGE_MODE`
- `AWS_REGION`
- `NEWS_DATA_BUCKET`
- `NEWS_DATA_RAW_KEY`
- `NEWS_DATA_CLEAN_KEY`

## Local ingest flow

Install dependencies:

- `cd services/data-collection && npm install`

Run ingestion:

- `cd services/data-collection && npm run ingest`

Result:

- local files are refreshed
- mock storage writes to the local files by default
- S3 upload runs only if storage mode is switched to `s3`

## Runtime Lambda flow

Install Python dependencies:

- `cd services/runtime-api && python -m pip install -r requirements.txt`

Deploy `handler.lambda_handler` behind Lambda Function URL or API Gateway.

Example request:

- `GET /?keyword=election&limit=10`

Response includes:

- `keyword`
- `totalMatches`
- `rankings`
- `articles`

## Frontend flow

Open [frontend/index.html](frontend/index.html) in a browser or serve the folder with a simple static file server.

Provide the deployed runtime API URL, enter a keyword, and submit.

## Notes

- [services/data-retrieval](services/data-retrieval) is a legacy MVP artifact from the earlier split-service version.
- the collection layer now uses provider-based adapters so adding another outlet only requires a new source config and, if needed, one adapter mapper in [services/data-collection/src/services/source-clients.ts](services/data-collection/src/services/source-clients.ts)
- For larger datasets, the runtime layer should move from S3 JSON scanning to an indexed store such as DynamoDB or OpenSearch.