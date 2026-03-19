/*
Run charts from services/data-retrieval with either:
  node run-charts.js
  npm run charts:run

Override values without editing this file:
  npm run charts:run -- trump --mode local --input ../../data/clean-articles.json
  npm run charts:run -- --keyword economy --year 2025 --timeframe 30d --sourceLimit 8

Change defaults by editing the config object below:
  - keyword, year, timeframe, sourceLimit, width, height control the chart request values
  - dataSourceMode "local" forces reads from inputPath
  - dataSourceMode "s3" uses s3Bucket, s3CleanKey, and s3Region
  - runScriptCharts / runSentimentTrendJson / runSourcesCompareJson /
    runMonthlyMentionsJson / runMonthlyMentionsPng toggle each output group
  - useManagedApiProcess starts a temporary retrieval API so the JSON and PNG
    exports use the same data source settings as the script charts
*/
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { spawn } = require("child_process");

const serviceRoot = __dirname;
const outputDir = path.join(serviceRoot, "chart-output");

// Default chart inputs. Edit these when you want a new baseline run.
const config = {
  keyword: "trump",
  year: new Date().getFullYear(),
  timeframe: "30d",
  sourceLimit: 6,
  width: 1600,
  height: 900,
  openImages: false,

  // Data source selection.
  // local: read from inputPath
  // s3: read from s3Bucket + s3CleanKey
  dataSourceMode: "s3",
  inputPath: "../../data/clean-articles.json",
  s3Bucket: "news-sentiment-analyzer-data-v1",
  s3CleanKey: "clean/clean-articles.json",
  s3Region: "us-east-1",

  // API export settings. A managed API process keeps endpoint exports aligned
  // with the same data source used for the script-generated charts.
  useManagedApiProcess: true,
  apiPort: 8010,
  apiBaseUrl: "",

  // Toggle chart groups on or off.
  runScriptCharts: true,
  runSentimentTrendJson: true,
  runSourcesCompareJson: true,
  runMonthlyMentionsJson: true,
  runMonthlyMentionsPng: true,
};

function parseArgs(argv) {
  const args = {};
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }

    const raw = token.slice(2);
    const eqIndex = raw.indexOf("=");
    if (eqIndex >= 0) {
      const key = raw.slice(0, eqIndex);
      const value = raw.slice(eqIndex + 1);
      args[key] = value || true;
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[raw] = true;
      continue;
    }

    args[raw] = next;
    index += 1;
  }

  return { args, positional };
}

function getStringArg(args, ...keys) {
  for (const key of keys) {
    if (typeof args[key] === "string") {
      return args[key].trim();
    }
  }
  return "";
}

function getBooleanArg(args, ...keys) {
  for (const key of keys) {
    const value = args[key];
    if (value === true) {
      return true;
    }
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["1", "true", "yes", "on"].includes(normalized)) {
        return true;
      }
      if (["0", "false", "no", "off"].includes(normalized)) {
        return false;
      }
    }
  }
  return undefined;
}

function getIntegerArg(args, ...keys) {
  for (const key of keys) {
    if (typeof args[key] !== "string") {
      continue;
    }

    const parsed = Number.parseInt(args[key], 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

function slugify(value) {
  return (
    String(value || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "keyword"
  );
}

function getDateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function getApiBaseUrl() {
  if (config.apiBaseUrl.trim()) {
    return config.apiBaseUrl.trim().replace(/\/$/, "");
  }

  if (config.useManagedApiProcess) {
    return `http://localhost:${config.apiPort}/api`;
  }

  return "http://localhost:8001/api";
}

function getHealthUrl(baseUrl) {
  return `${baseUrl.replace(/\/api\/?$/, "")}/health`;
}

function resolveLocalInputPath() {
  const resolvedPath = path.resolve(serviceRoot, config.inputPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Local input file not found: ${config.inputPath}`);
  }

  return resolvedPath;
}

function getDataSourceEnvironment() {
  const mode = String(config.dataSourceMode || "").trim().toLowerCase();
  if (mode === "local") {
    return {
      NEWS_DATA_LOCAL_CLEAN_PATH: resolveLocalInputPath(),
      NEWS_DATA_BUCKET: null,
      NEWS_DATA_CLEAN_KEY: null,
      AWS_REGION: null,
    };
  }

  if (mode === "s3") {
    if (!String(config.s3Bucket || "").trim()) {
      throw new Error("s3Bucket must be set when dataSourceMode is 's3'.");
    }
    if (!String(config.s3Region || "").trim()) {
      throw new Error("s3Region must be set when dataSourceMode is 's3'.");
    }

    return {
      NEWS_DATA_LOCAL_CLEAN_PATH: null,
      NEWS_DATA_BUCKET: config.s3Bucket,
      NEWS_DATA_CLEAN_KEY: String(config.s3CleanKey || "").trim() || "clean/clean-articles.json",
      AWS_REGION: config.s3Region,
    };
  }

  throw new Error(`dataSourceMode must be 'local' or 's3'. Current value: ${config.dataSourceMode}`);
}

function buildChildEnv(overrides) {
  const env = { ...process.env };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === undefined || String(value).length === 0) {
      delete env[key];
      continue;
    }

    env[key] = String(value);
  }
  return env;
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const spawnCommand =
      process.platform === "win32" && command === "npm"
        ? process.env.ComSpec || "cmd.exe"
        : command;
    const spawnArgs =
      process.platform === "win32" && command === "npm"
        ? ["/d", "/s", "/c", `${command} ${args.join(" ")}`]
        : args;

    const child = spawn(spawnCommand, spawnArgs, {
      cwd: serviceRoot,
      stdio: options.stdio || "inherit",
      env: options.env || process.env,
      windowsHide: true,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const details = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`${command} ${args.join(" ")} failed with ${details}.`));
    });
  });
}

async function invokeBuild() {
  await runCommand("npm", ["run", "build", "--silent"]);
}

async function invokeScriptCharts(dataEnvironment) {
  const args = ["dist/src/scripts/generate-charts.js", config.keyword];
  if (String(config.dataSourceMode).trim().toLowerCase() === "local") {
    args.push("--input", config.inputPath);
  }
  if (config.openImages) {
    args.push("--open");
  }

  await runCommand("node", args, {
    env: buildChildEnv(dataEnvironment),
  });
}

async function ensureApiAvailable(baseUrl) {
  const response = await fetchWithTimeout(getHealthUrl(baseUrl), { timeoutMs: 5000 });
  if (!response.ok) {
    throw new Error(`Retrieval API health check failed at ${baseUrl} with status ${response.status}.`);
  }
}

async function fetchWithTimeout(url, { timeoutMs = 60000 } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function saveJsonFromApi(relativePath, filePath, baseUrl) {
  let response;
  try {
    response = await fetchWithTimeout(`${baseUrl}/${relativePath}`, { timeoutMs: 60000 });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Request timed out for ${relativePath}.`);
    }
    throw error;
  }

  if (!response.ok) {
    throw new Error(`Request failed for ${relativePath} with status ${response.status}.`);
  }

  const payload = await response.json();
  await fsp.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function saveBinaryFromApi(relativePath, filePath, baseUrl) {
  let response;
  try {
    response = await fetchWithTimeout(`${baseUrl}/${relativePath}`, { timeoutMs: 120000 });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Request timed out for ${relativePath}.`);
    }
    throw error;
  }

  if (!response.ok) {
    throw new Error(`Request failed for ${relativePath} with status ${response.status}.`);
  }

  const arrayBuffer = await response.arrayBuffer();
  await fsp.writeFile(filePath, Buffer.from(arrayBuffer));
}

async function startManagedApiProcess(dataEnvironment) {
  const stdoutPath = path.join(outputDir, "managed-api.stdout.log");
  const stderrPath = path.join(outputDir, "managed-api.stderr.log");

  await Promise.all([
    fsp.rm(stdoutPath, { force: true }),
    fsp.rm(stderrPath, { force: true }),
  ]);

  const stdoutStream = fs.createWriteStream(stdoutPath, { flags: "a" });
  const stderrStream = fs.createWriteStream(stderrPath, { flags: "a" });
  const child = spawn("node", ["dist/src/main.js"], {
    cwd: serviceRoot,
    env: buildChildEnv({
      ...dataEnvironment,
      DATA_RETRIEVAL_PORT: config.apiPort,
      PORT: config.apiPort,
      RUNTIME_CACHE_TTL_SECONDS: 0,
    }),
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  child.stdout.pipe(stdoutStream);
  child.stderr.pipe(stderrStream);

  return {
    child,
    stdoutPath,
    stderrPath,
    stdoutStream,
    stderrStream,
  };
}

async function waitForManagedApi(managedApi, baseUrl) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (managedApi.child.exitCode !== null) {
      const stderr = await readIfExists(managedApi.stderrPath);
      throw new Error(`Managed retrieval API exited before becoming healthy. ${stderr}`.trim());
    }

    try {
      const response = await fetchWithTimeout(getHealthUrl(baseUrl), { timeoutMs: 2000 });
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until timeout or process exit.
    }

    await delay(500);
  }

  const stderr = await readIfExists(managedApi.stderrPath);
  throw new Error(`Timed out waiting for retrieval API at ${getHealthUrl(baseUrl)}. ${stderr}`.trim());
}

async function stopManagedApi(managedApi) {
  if (!managedApi) {
    return;
  }

  if (managedApi.child.exitCode === null) {
    managedApi.child.kill();
    await Promise.race([
      new Promise((resolve) => managedApi.child.once("exit", resolve)),
      delay(5000),
    ]);
  }

  managedApi.stdoutStream.end();
  managedApi.stderrStream.end();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readIfExists(filePath) {
  try {
    return await fsp.readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

function openFile(filePath) {
  let command;
  let args;

  if (process.platform === "win32") {
    command = "cmd";
    args = ["/c", "start", "", filePath];
  } else if (process.platform === "darwin") {
    command = "open";
    args = [filePath];
  } else {
    command = "xdg-open";
    args = [filePath];
  }

  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
}

function applyCliOverrides() {
  const { args, positional } = parseArgs(process.argv.slice(2));
  if (args.help || args.h) {
    printUsage();
    process.exit(0);
  }

  const keyword = getStringArg(args, "keyword");
  if (keyword) {
    config.keyword = keyword;
  } else if (positional[0]) {
    config.keyword = positional[0];
  }

  const year = getIntegerArg(args, "year");
  if (year !== undefined) {
    config.year = year;
  }

  const timeframe = getStringArg(args, "timeframe");
  if (timeframe) {
    config.timeframe = timeframe;
  }

  const sourceLimit = getIntegerArg(args, "sourceLimit");
  if (sourceLimit !== undefined) {
    config.sourceLimit = sourceLimit;
  }

  const width = getIntegerArg(args, "width");
  if (width !== undefined) {
    config.width = width;
  }

  const height = getIntegerArg(args, "height");
  if (height !== undefined) {
    config.height = height;
  }

  const inputPath = getStringArg(args, "input", "inputPath");
  if (inputPath) {
    config.inputPath = inputPath;
  }

  const mode = getStringArg(args, "mode", "dataSourceMode");
  if (mode) {
    config.dataSourceMode = mode;
  }

  const s3Bucket = getStringArg(args, "bucket", "s3Bucket");
  if (s3Bucket) {
    config.s3Bucket = s3Bucket;
  }

  const s3CleanKey = getStringArg(args, "cleanKey", "s3CleanKey");
  if (s3CleanKey) {
    config.s3CleanKey = s3CleanKey;
  }

  const s3Region = getStringArg(args, "region", "s3Region");
  if (s3Region) {
    config.s3Region = s3Region;
  }

  const apiPort = getIntegerArg(args, "apiPort");
  if (apiPort !== undefined) {
    config.apiPort = apiPort;
  }

  const apiBaseUrl = getStringArg(args, "apiBaseUrl");
  if (apiBaseUrl) {
    config.apiBaseUrl = apiBaseUrl;
  }

  const openImages = getBooleanArg(args, "open", "openImages");
  if (openImages !== undefined) {
    config.openImages = openImages;
  }

  const useManagedApiProcess = getBooleanArg(args, "managedApi", "useManagedApiProcess");
  if (useManagedApiProcess !== undefined) {
    config.useManagedApiProcess = useManagedApiProcess;
  }
}

function printUsage() {
  console.log("Run script-generated charts plus chart API exports.");
  console.log("");
  console.log("Usage:");
  console.log("  node run-charts.js");
  console.log("  node run-charts.js trump --mode local --input ../../data/clean-articles.json");
  console.log("  node run-charts.js economy --mode local --input ../../data/clean-articles.json");
  console.log("  npm run charts:run -- economy --mode local --open true");
}

async function main() {
  applyCliOverrides();
  await fsp.mkdir(outputDir, { recursive: true });

  const dateStamp = getDateStamp();
  const keywordSlug = slugify(config.keyword);
  const needsApi =
    config.runSentimentTrendJson ||
    config.runSourcesCompareJson ||
    config.runMonthlyMentionsJson ||
    config.runMonthlyMentionsPng;
  const dataEnvironment = getDataSourceEnvironment();
  const apiBaseUrl = getApiBaseUrl();

  let managedApi = null;

  try {
    if (config.runScriptCharts || (needsApi && config.useManagedApiProcess)) {
      await invokeBuild();
    }

    if (config.runScriptCharts) {
      await invokeScriptCharts(dataEnvironment);
    }

    if (needsApi) {
      if (config.useManagedApiProcess) {
        managedApi = await startManagedApiProcess(dataEnvironment);
        await waitForManagedApi(managedApi, apiBaseUrl);
      } else {
        await ensureApiAvailable(apiBaseUrl);
      }

      if (config.runSentimentTrendJson) {
        await saveJsonFromApi(
          `chart/sentiment/trend?keyword=${encodeURIComponent(config.keyword)}&timeframe=${encodeURIComponent(config.timeframe)}`,
          path.join(outputDir, `${dateStamp}-${keywordSlug}-chart-sentiment-trend.json`),
          apiBaseUrl,
        );
      }

      if (config.runSourcesCompareJson) {
        await saveJsonFromApi(
          `chart/sources/compare?keyword=${encodeURIComponent(config.keyword)}&timeframe=${encodeURIComponent(config.timeframe)}`,
          path.join(outputDir, `${dateStamp}-${keywordSlug}-chart-sources-compare.json`),
          apiBaseUrl,
        );
      }

      if (config.runMonthlyMentionsJson) {
        await saveJsonFromApi(
          `chart/mentions/monthly?keyword=${encodeURIComponent(config.keyword)}&year=${encodeURIComponent(String(config.year))}&sourceLimit=${encodeURIComponent(String(config.sourceLimit))}`,
          path.join(outputDir, `${dateStamp}-${keywordSlug}-chart-mentions-monthly.json`),
          apiBaseUrl,
        );
      }

      if (config.runMonthlyMentionsPng) {
        await saveBinaryFromApi(
          `chart/mentions/monthly.png?keyword=${encodeURIComponent(config.keyword)}&year=${encodeURIComponent(String(config.year))}&sourceLimit=${encodeURIComponent(String(config.sourceLimit))}&width=${encodeURIComponent(String(config.width))}&height=${encodeURIComponent(String(config.height))}`,
          path.join(outputDir, `${dateStamp}-${keywordSlug}-chart-mentions-monthly.png`),
          apiBaseUrl,
        );
      }
    }

    const outputs = (await fsp.readdir(outputDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.startsWith(`${dateStamp}-${keywordSlug}-`))
      .map((entry) => entry.name)
      .sort();

    const details = await Promise.all(
      outputs.map(async (name) => {
        const filePath = path.join(outputDir, name);
        const stats = await fsp.stat(filePath);
        return {
          Name: name,
          Length: stats.size,
          LastWriteTime: stats.mtime.toLocaleString(),
        };
      }),
    );

    console.table(details);

    if (config.openImages) {
      for (const name of outputs.filter((entry) => entry.endsWith(".png"))) {
        openFile(path.join(outputDir, name));
      }
    }
  } finally {
    await stopManagedApi(managedApi);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(1);
});