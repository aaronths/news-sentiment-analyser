import {
  appendRawArticles,
  getRawArticlesPath,
  readRawArticles,
} from "./data-store.service";
import { collectArticlesFromSources } from "./source-clients";
import { getCleanArticlesPath, writeCleanArticles } from "./clean-store.service";
import { preprocessArticles } from "./preprocess.service";
import { uploadFileToS3 } from "./s3-sync.service";
import { IngestionSummary } from "../types/article";

interface IngestionOptions {
  perSource?: number;
  sourceIds?: string[];
}

const resolveRawKey = () => process.env.NEWS_DATA_RAW_KEY?.trim() || "raw/raw-articles.json";
const resolveCleanKey = () => process.env.NEWS_DATA_CLEAN_KEY?.trim() || "clean/clean-articles.json";

export const runIngestionPipeline = async (
  options: IngestionOptions = {},
): Promise<IngestionSummary> => {
  const startedAt = new Date().toISOString();
  const { articles, sourceBreakdown } = await collectArticlesFromSources({
    sourceIds: options.sourceIds,
    perSource: options.perSource ?? 10,
  });

  const rawStorageResult = await appendRawArticles(articles);
  const rawArticles = await readRawArticles();
  const cleanArticles = preprocessArticles(rawArticles);
  const cleanStorageResult = await writeCleanArticles(cleanArticles);

  const [rawUpload, cleanUpload] = await Promise.all([
    uploadFileToS3({
      filePath: getRawArticlesPath(),
      key: resolveRawKey(),
      contentType: "application/json",
    }),
    uploadFileToS3({
      filePath: getCleanArticlesPath(),
      key: resolveCleanKey(),
      contentType: "application/json",
    }),
  ]);

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    collectedCount: articles.length,
    cleanCount: cleanArticles.length,
    rawStorageCount: rawStorageResult.totalArticles,
    cleanStorageCount: cleanStorageResult.totalArticles,
    sourceBreakdown,
    uploads: {
      raw: rawUpload,
      clean: cleanUpload,
    },
  };
};
