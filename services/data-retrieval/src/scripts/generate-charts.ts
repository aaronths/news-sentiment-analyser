import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import {
  buildDistributionChartConfig,
  buildRankingsChartConfig,
  parseChartDimension,
  renderChartToPng,
} from "../services/charts.service";

type CliArgs = Record<string, string | boolean>;

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  const positional: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const withNoPrefix = token.slice(2);
    const equalIndex = withNoPrefix.indexOf("=");
    if (equalIndex >= 0) {
      const key = withNoPrefix.slice(0, equalIndex);
      const value = withNoPrefix.slice(equalIndex + 1);
      args[key] = value || true;
      continue;
    }

    const key = withNoPrefix;
    const maybeValue = argv[index + 1];
    if (!maybeValue || maybeValue.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = maybeValue;
    index += 1;
  }

  if (typeof args.keyword !== "string" && positional.length > 0) {
    args.keyword = positional[0];
  }
  if (typeof args.input !== "string" && positional.length > 1) {
    args.input = positional[1];
  }

  return args;
}

function getStringArg(args: CliArgs, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

function hasFlag(args: CliArgs, key: string): boolean {
  return args[key] === true;
}

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "keyword"
  );
}

function printUsage(): void {
  console.log("Generate chart screenshots directly to files (no localhost endpoints needed).");
  console.log("");
  console.log("Usage:");
  console.log("  npm run charts:generate -- economy [--input ../../data/clean-articles.json] [--sourceId guardian] [--width 1400] [--height 800] [--outDir chart-output] [--open]");
  console.log("  npm run charts:generate -- --keyword=economy [--input=../../data/clean-articles.json] [--open]");
}

function openFile(filePath: string): void {
  try {
    if (process.platform === "win32") {
      const child = spawn("cmd", ["/c", "start", "", `\"${filePath}\"`], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      return;
    }

    if (process.platform === "darwin") {
      const child = spawn("open", [filePath], { detached: true, stdio: "ignore" });
      child.unref();
      return;
    }

    const child = spawn("xdg-open", [filePath], { detached: true, stdio: "ignore" });
    child.unref();
  } catch {
    // opening the file is a convenience; generation still succeeds without it
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const keyword = String(getStringArg(args, "keyword") || "").trim();
  if (!keyword) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const sourceId = String(getStringArg(args, "sourceId") || "").trim() || undefined;
  const inputPath = String(getStringArg(args, "input") || "").trim();
  if (inputPath) {
    process.env.NEWS_DATA_LOCAL_CLEAN_PATH = path.resolve(process.cwd(), inputPath);
  }

  const width = parseChartDimension(getStringArg(args, "width"), 1400, 400, 2400);
  const height = parseChartDimension(getStringArg(args, "height"), 800, 300, 1600);
  const outDir = path.resolve(process.cwd(), getStringArg(args, "outDir") || "chart-output");

  const [rankingsConfig, distributionConfig] = await Promise.all([
    buildRankingsChartConfig(keyword, sourceId),
    buildDistributionChartConfig(keyword),
  ]);

  const [rankingsPng, distributionPng] = await Promise.all([
    renderChartToPng(rankingsConfig, width, height),
    renderChartToPng(distributionConfig, Math.min(width, 1200), Math.min(height, 900)),
  ]);

  await fs.mkdir(outDir, { recursive: true });

  const stamp = new Date().toISOString().slice(0, 10);
  const slug = slugify(keyword);
  const rankingsPath = path.join(outDir, `${stamp}-${slug}-rankings.png`);
  const distributionPath = path.join(outDir, `${stamp}-${slug}-distribution.png`);

  await Promise.all([
    fs.writeFile(rankingsPath, rankingsPng),
    fs.writeFile(distributionPath, distributionPng),
  ]);

  console.log("Generated chart images:");
  console.log(`- ${rankingsPath}`);
  console.log(`- ${distributionPath}`);
  if (inputPath) {
    console.log(`Input file: ${process.env.NEWS_DATA_LOCAL_CLEAN_PATH}`);
  }

  if (hasFlag(args, "open")) {
    openFile(rankingsPath);
    openFile(distributionPath);
    console.log("Opened the images in your default viewer.");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to generate chart images: ${message}`);
  process.exit(1);
});