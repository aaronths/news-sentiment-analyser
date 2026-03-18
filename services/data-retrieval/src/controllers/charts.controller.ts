import { Request, Response } from "express";
import {
  buildDistributionChartConfig,
  buildRankingsChartConfig,
  parseChartDimension,
  renderChartToPng,
} from "../services/charts.service";

function getKeyword(req: Request): string {
  return String(req.query.keyword || "").trim();
}

function getSourceId(req: Request): string | undefined {
  const value = String(req.query.sourceId || "").trim();
  return value || undefined;
}

function validateKeyword(res: Response, keyword: string): boolean {
  if (keyword) {
    return true;
  }
  res.status(400).json({ code: 400, message: "keyword required" });
  return false;
}

export const getRankingsChartData = async (req: Request, res: Response) => {
  const keyword = getKeyword(req);
  if (!validateKeyword(res, keyword)) {
    return;
  }

  const sourceId = getSourceId(req);
  const chartConfig = await buildRankingsChartConfig(keyword, sourceId);
  res.json(chartConfig);
};

export const getDistributionChartData = async (req: Request, res: Response) => {
  const keyword = getKeyword(req);
  if (!validateKeyword(res, keyword)) {
    return;
  }

  const chartConfig = await buildDistributionChartConfig(keyword);
  res.json(chartConfig);
};

export const getRankingsChartImage = async (req: Request, res: Response) => {
  const keyword = getKeyword(req);
  if (!validateKeyword(res, keyword)) {
    return;
  }

  const sourceId = getSourceId(req);
  const width = parseChartDimension(String(req.query.width || ""), 1280, 400, 2400);
  const height = parseChartDimension(String(req.query.height || ""), 720, 300, 1600);
  const chartConfig = await buildRankingsChartConfig(keyword, sourceId);
  const image = await renderChartToPng(chartConfig, width, height);

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-store");
  res.send(image);
};

export const getDistributionChartImage = async (req: Request, res: Response) => {
  const keyword = getKeyword(req);
  if (!validateKeyword(res, keyword)) {
    return;
  }

  const width = parseChartDimension(String(req.query.width || ""), 1000, 400, 2400);
  const height = parseChartDimension(String(req.query.height || ""), 700, 300, 1600);
  const chartConfig = await buildDistributionChartConfig(keyword);
  const image = await renderChartToPng(chartConfig, width, height);

  res.setHeader("Content-Type", "image/png");
  res.setHeader("Cache-Control", "no-store");
  res.send(image);
};