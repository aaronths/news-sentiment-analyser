import { CleanArticle, RawArticle } from "../types/article";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "with",
]);

const stripHtml = (value: string) => value.replace(/<[^>]+>/g, " ");
const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const extractKeywordTokens = (value: string) => {
  const matches = value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const uniqueTokens = new Set(
    matches.filter((token) => token.length > 2 && !STOP_WORDS.has(token)),
  );

  return Array.from(uniqueTokens).sort();
};

const buildSummary = (value: string) => {
  if (value.length <= 220) {
    return value;
  }

  return `${value.slice(0, 217).trimEnd()}...`;
};

export const toCleanArticle = (article: RawArticle): CleanArticle => {
  const title = normalizeWhitespace(stripHtml(article.headline));
  const body = normalizeWhitespace(stripHtml(article.content));
  const sentimentText = `${title}. ${body}`.trim();

  return {
    id: article.id,
    sourceId: article.sourceId,
    sourceName: article.sourceName,
    title,
    body,
    summary: buildSummary(body),
    publishedAt: article.publishedAt,
    collectedAt: article.collectedAt,
    url: article.url,
    keywordTokens: extractKeywordTokens(`${title} ${body}`),
    sentimentText,
  };
};

export const preprocessArticles = (articles: RawArticle[]): CleanArticle[] => {
  const dedupeMap = new Map<string, CleanArticle>();

  for (const article of articles) {
    const cleanArticle = toCleanArticle(article);
    dedupeMap.set(cleanArticle.id, cleanArticle);
  }

  return Array.from(dedupeMap.values()).sort((left, right) => {
    return right.publishedAt.localeCompare(left.publishedAt);
  });
};
