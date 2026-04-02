import { spawn } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { resolveSuiteFiles } from "../config/test-suites";

const allowedEnvironments = new Set(["local", "dev", "prod"]);

export interface RunTestsInput {
  suite?: string | undefined;
  environment?: string | undefined;
}

export interface RunTestsResult {
  ok: boolean;
  suite: string;
  environment: string;
  files: string[];
  exitCode: number | null;
  durationMs: number;
  command: string;
  summary: {
    totalSuites: number;
    passedSuites: number;
    failedSuites: number;
    totalTests: number;
    passedTests: number;
    failedTests: number;
    pendingTests: number;
  };
  failingTests: Array<{
    suite: string;
    testName: string;
    fullName: string;
    failureMessages: string[];
  }>;
  output?: {
    stdout: string;
    stderr: string;
  };
}

let isRunning = false;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const waitForFile = async (filePath: string, retries = 10, delayMs = 100): Promise<boolean> => {
  for (let i = 0; i < retries; i += 1) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      await sleep(delayMs);
    }
  }
  return false;
};

const extractCount = (text: string, label: string): number => {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`${escaped}:\\s*(\\d+)`, "i");
  const match = text.match(regex);
  return match ? Number(match[1]) : 0;
};

const parseSummaryFromText = (text: string): RunTestsResult["summary"] => {
  const suiteTotal = extractCount(text, "Test Suites");
  const suiteFailed = extractCount(text, "failed");
  const suitePassed = extractCount(text, "passed");

  const testsMatch = text.match(/Tests:\s*([^\n\r]+)/i)?.[1] ?? "";
  const totalTests = extractCount(testsMatch, "total");
  const failedTests = extractCount(testsMatch, "failed");
  const passedTests = extractCount(testsMatch, "passed");
  const pendingTests = extractCount(testsMatch, "pending") || extractCount(testsMatch, "skipped");

  return {
    totalSuites: suiteTotal,
    passedSuites: suitePassed,
    failedSuites: suiteFailed,
    totalTests,
    passedTests,
    failedTests,
    pendingTests,
  };
};

export const runSuite = async (input: RunTestsInput): Promise<RunTestsResult> => {
  if (isRunning) {
    throw new Error("A test run is already in progress.");
  }

  const suite = input.suite ?? "all";
  const environment = (input.environment ?? process.env.TEST_TARGET_ENV ?? process.env.NODE_ENV ?? "local").toLowerCase();

  if (!allowedEnvironments.has(environment)) {
    throw new Error("Invalid environment. Use one of: local, dev, prod.");
  }

  const files = resolveSuiteFiles(suite);
  const jestBin = path.join(process.cwd(), "node_modules", "jest", "bin", "jest.js");
  const jsonOutputPath = path.join(os.tmpdir(), `jest-results-${Date.now()}.json`);
  const args = [
    jestBin,
    "--runInBand",
    "--colors=false",
    "--json",
    "--outputFile",
    jsonOutputPath,
    ...files,
  ];
  const startedAt = Date.now();

  isRunning = true;

  try {
    const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, args, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: environment,
          TEST_TARGET_ENV: environment,
        },
      });

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      child.on("error", reject);
      child.on("close", (code) => {
        resolve({ code, stdout, stderr });
      });
    });

    const hasJsonOutput = await waitForFile(jsonOutputPath);
    if (!hasJsonOutput) {
      const combined = `${result.stdout}\n${result.stderr}`;
      const summary = parseSummaryFromText(combined);

      return {
        ok: result.code === 0,
        suite,
        environment,
        files,
        exitCode: result.code,
        durationMs: Date.now() - startedAt,
        command: [process.execPath, ...args].join(" "),
        summary,
        failingTests: [],
        output: {
          stdout: result.stdout,
          stderr: result.stderr,
        },
      };
    }

    const parsed = await parseJestJsonResult(jsonOutputPath);

    return {
      ok: result.code === 0,
      suite,
      environment,
      files,
      exitCode: result.code,
      durationMs: Date.now() - startedAt,
      command: [process.execPath, ...args].join(" "),
      summary: parsed.summary,
      failingTests: parsed.failingTests,
    };
  } finally {
    try {
      await fs.unlink(jsonOutputPath);
    } catch {
      // Ignore cleanup failure for temp output file.
    }
    isRunning = false;
  }
};

interface JestAssertionResult {
  ancestorTitles: string[];
  fullName: string;
  status: string;
  title: string;
  failureMessages: string[];
}

interface JestTestResult {
  name: string;
  assertionResults: JestAssertionResult[];
}

interface JestJsonResult {
  numTotalTestSuites: number;
  numPassedTestSuites: number;
  numFailedTestSuites: number;
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  testResults: JestTestResult[];
}

const parseJestJsonResult = async (
  filePath: string,
): Promise<{ summary: RunTestsResult["summary"]; failingTests: RunTestsResult["failingTests"] }> => {
  const exists = await waitForFile(filePath);
  if (!exists) {
    throw new Error(`Jest results file was not found: ${filePath}`);
  }

  const raw = await fs.readFile(filePath, "utf8");
  const json = JSON.parse(raw) as JestJsonResult;

  const failingTests = json.testResults.flatMap((suiteResult) => {
    return suiteResult.assertionResults
      .filter((assertion) => assertion.status === "failed")
      .map((assertion) => ({
        suite: path.basename(suiteResult.name),
        testName: assertion.title,
        fullName: assertion.fullName,
        failureMessages: assertion.failureMessages,
      }));
  });

  return {
    summary: {
      totalSuites: json.numTotalTestSuites,
      passedSuites: json.numPassedTestSuites,
      failedSuites: json.numFailedTestSuites,
      totalTests: json.numTotalTests,
      passedTests: json.numPassedTests,
      failedTests: json.numFailedTests,
      pendingTests: json.numPendingTests,
    },
    failingTests,
  };
};
