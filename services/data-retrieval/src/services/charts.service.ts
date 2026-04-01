import type { ChartConfiguration } from "chart.js";
import { ChartJSNodeCanvas } from "chartjs-node-canvas";
import ChartDataLabels from "chartjs-plugin-datalabels";
import {
  computeSentimentForArticles,
  labelForCompound,
  searchArticles,
} from "./articles.service";
import { logger } from "../utils/logger";

type SentimentBucket = "positive" | "neutral" | "negative";

type OutletAggregate = {
  sourceId: string;
  sourceName: string;
  articleCount: number;
  compoundScores: number[];
};

export type OutletRanking = {
  sourceId: string;
  sourceName: string;
  articleCount: number;
  averageCompound: number;
  sentimentLabel: SentimentBucket;
};

export type SentimentDistribution = {
  articleCount: number;
  averageSentiment: number;
  distribution: Record<SentimentBucket, number>;
};

function toSentimentBucket(label: string): SentimentBucket {
  if (label === "positive") return "positive";
  if (label === "negative") return "negative";
  return "neutral";
}

export function parseChartDimension(
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number
): number {
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export async function buildOutletRankings(
  keyword: string,
  sourceId?: string
): Promise<OutletRanking[]> {
  const matched = await searchArticles(keyword, sourceId);
  const scored = await computeSentimentForArticles(matched);

  const outlets: Record<string, OutletAggregate> = {};
  for (const entry of scored) {
    const article = entry.article;
    const key = String(article.sourceId || "unknown");
    const outlet = (outlets[key] ||= {
      sourceId: String(article.sourceId || "unknown"),
      sourceName: String(article.sourceName || article.sourceId || "Unknown"),
      articleCount: 0,
      compoundScores: [],
    });
    outlet.articleCount += 1;
    outlet.compoundScores.push(Number(entry.scores.compound || 0));
  }

  const rankings = Object.values(outlets).map((outlet) => {
    const avgCompound =
      outlet.compoundScores.reduce((sum, score) => sum + score, 0) /
      (outlet.compoundScores.length || 1);

    return {
      sourceId: outlet.sourceId,
      sourceName: outlet.sourceName,
      articleCount: outlet.articleCount,
      averageCompound: Number(avgCompound.toFixed(4)),
      sentimentLabel: toSentimentBucket(labelForCompound(avgCompound)),
    };
  });

  rankings.sort((a, b) => b.averageCompound - a.averageCompound);
  return rankings;
}

export async function buildSentimentDistribution(
  keyword: string
): Promise<SentimentDistribution> {
  const matched = await searchArticles(keyword);
  const scored = await computeSentimentForArticles(matched);

  const distribution: Record<SentimentBucket, number> = {
    positive: 0,
    neutral: 0,
    negative: 0,
  };

  for (const entry of scored) {
    const label = toSentimentBucket(labelForCompound(entry.scores.compound));
    distribution[label] += 1;
  }

  const averageSentiment =
    scored.reduce((sum, entry) => sum + Number(entry.scores.compound || 0), 0) /
    (scored.length || 1);

  return {
    articleCount: matched.length,
    averageSentiment: Number(averageSentiment.toFixed(4)),
    distribution,
  };
}

export async function buildRankingsChartConfig(
  keyword: string,
  sourceId?: string
): Promise<ChartConfiguration> {
  const rankings = await buildOutletRankings(keyword, sourceId);
  const labels = rankings.map((ranking) => ranking.sourceName);
  const values = rankings.map((ranking) => ranking.averageCompound);
  const colors = values.map((value) => (value >= 0 ? "#2a9d8f" : "#e76f51"));
  const hasData = values.length > 0;

  return {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Average Compound Sentiment",
          data: values,
          backgroundColor: colors,
          borderColor: "#1f2937",
          borderWidth: 1,
        },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: `Average sentiment by source for \"${keyword}\"`,
        },
        legend: { display: false },
        datalabels: hasData
          ? {
              anchor: "end",
              align: "top",
              color: "#111827",
              font: {
                weight: "bold",
              },
              formatter: (value: number) => Number(value).toFixed(3),
            }
          : { display: false },
      },
      scales: {
        y: {
          min: -1,
          max: 1,
          title: {
            display: true,
            text: "Compound score",
          },
        },
      },
    },
  };
}

export async function buildDistributionChartConfig(
  keyword: string
): Promise<ChartConfiguration> {
  const sentiment = await buildSentimentDistribution(keyword);
  const entries = [
    { label: "Positive", value: sentiment.distribution.positive, color: "#2a9d8f" },
    { label: "Neutral", value: sentiment.distribution.neutral, color: "#e9c46a" },
    { label: "Negative", value: sentiment.distribution.negative, color: "#e76f51" },
  ];
  const nonZeroEntries = entries.filter((entry) => entry.value > 0);
  const datasetEntries = nonZeroEntries.length ? nonZeroEntries : entries;

  const values = datasetEntries.map((entry) => entry.value);
  const labels = datasetEntries.map((entry) => entry.label);
  const colors = datasetEntries.map((entry) => entry.color);

  return {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          label: "Article sentiment distribution",
          data: values,
          backgroundColor: colors,
        },
      ],
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: `Sentiment distribution for \"${keyword}\"`,
        },
        // chartjs-plugin-datalabels is unstable for doughnut rendering in
        // headless node-canvas; keep labels off for this chart type.
        datalabels: { display: false },
      },
    },
  };
}

export async function renderChartToPng(
  chartConfig: ChartConfiguration,
  width: number,
  height: number
): Promise<Buffer> {
  // 1. Convert your Chart.js config into a URL-friendly string
  const configString = encodeURIComponent(JSON.stringify(chartConfig));
  logger.info(configString)
  // 2. Call the QuickChart API
  const url = `https://quickchart.io/chart?c=${configString}&w=${width}&h=${height}&f=png`;
  
  // 3. Fetch the image and return it as a Buffer
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to render chart image");
  }
  
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}