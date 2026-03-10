import { promises as fs } from "fs";
import path from "path";
import { CleanArticle } from "../types/article";

const getDataDirectory = () => path.resolve(__dirname, "../../../..", "data");
const CLEAN_ARTICLES_PATH = path.join(getDataDirectory(), "clean-articles.json");

const ensureStorage = async () => {
  await fs.mkdir(getDataDirectory(), { recursive: true });

  try {
    await fs.access(CLEAN_ARTICLES_PATH);
  } catch {
    await fs.writeFile(CLEAN_ARTICLES_PATH, "[]\n", "utf-8");
  }
};

export const readCleanArticles = async (): Promise<CleanArticle[]> => {
  await ensureStorage();
  const contents = await fs.readFile(CLEAN_ARTICLES_PATH, "utf-8");
  const parsed: unknown = JSON.parse(contents);
  return Array.isArray(parsed) ? (parsed as CleanArticle[]) : [];
};
