import { promises as fs } from "fs";
import path from "path";
import { RawArticle } from "../types/article";

const getDataDirectory = () => path.resolve(__dirname, "../../../..", "data");
const RAW_ARTICLES_PATH = path.join(getDataDirectory(), "raw-articles.json");

const ensureStorage = async () => {
  await fs.mkdir(getDataDirectory(), { recursive: true });

  try {
    await fs.access(RAW_ARTICLES_PATH);
  } catch {
    await fs.writeFile(RAW_ARTICLES_PATH, "[]\n", "utf-8");
  }
};

export const readRawArticles = async (): Promise<RawArticle[]> => {
  await ensureStorage();
  const fileContents = await fs.readFile(RAW_ARTICLES_PATH, "utf-8");
  const parsed: unknown = JSON.parse(fileContents);

  return Array.isArray(parsed) ? (parsed as RawArticle[]) : [];
};

export const appendRawArticles = async (articles: RawArticle[]) => {
  const existingArticles = await readRawArticles();
  const dedupeMap = new Map<string, RawArticle>();

  for (const article of existingArticles) {
    dedupeMap.set(article.id, article);
  }

  for (const article of articles) {
    dedupeMap.set(article.id, article);
  }

  const mergedArticles = Array.from(dedupeMap.values()).sort((left, right) => {
    return right.publishedAt.localeCompare(left.publishedAt);
  });

  await fs.writeFile(
    RAW_ARTICLES_PATH,
    `${JSON.stringify(mergedArticles, null, 2)}\n`,
    "utf-8",
  );

  return {
    totalArticles: mergedArticles.length,
    newArticles: Math.max(mergedArticles.length - existingArticles.length, 0),
  };
};

export const getRawArticlesPath = () => RAW_ARTICLES_PATH;