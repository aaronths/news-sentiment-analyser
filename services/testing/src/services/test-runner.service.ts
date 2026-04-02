import { sentimentTests } from "../tests/sentiment"; // <-- IMPORT YOUR TESTS HERE

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
    totalSuites: number; passedSuites: number; failedSuites: number;
    totalTests: number; passedTests: number; failedTests: number; pendingTests: number;
  };
  failingTests: Array<{ suite: string; testName: string; fullName: string; failureMessages: string[]; }>;
}

export const runSuite = async (input: RunTestsInput): Promise<RunTestsResult> => {
  const startedAt = Date.now();
  const environment = input.environment || "local";
  
  const summary = {
    totalSuites: 1, passedSuites: 0, failedSuites: 0,
    totalTests: 0, passedTests: 0, failedTests: 0, pendingTests: 0
  };
  const failingTests: any[] = [];

  // --- LOAD THE IMPORTED TESTS ---
  const tests = [
    ...sentimentTests,
    // When you write more files, just spread them here! e.g., ...userTests
  ];

  const results = await Promise.all(tests.map(async (test) => {
    try {
      await test.run();
      return { success: true, test };
    } catch (error: any) {
      return { success: false, test, error };
    }
  }));

  // 2. Tally up the results after they all finish
  for (const result of results) {
    summary.totalTests++;
    if (result.success) {
      summary.passedTests++;
    } else {
      summary.failedTests++;
      failingTests.push({
        suite: result.test.suite,
        testName: result.test.testName,
        fullName: `${result.test.suite} > ${result.test.testName}`,
        failureMessages: [result.error.message || "Test failed mysteriously"],
      });
    }
  }

  summary.failedSuites = summary.failedTests > 0 ? 1 : 0;
  summary.passedSuites = summary.failedTests === 0 ? 1 : 0;

  return {
    ok: summary.failedTests === 0,
    suite: input.suite || "all",
    environment,
    files: ["native-test-runner"],
    exitCode: summary.failedTests === 0 ? 0 : 1,
    durationMs: Date.now() - startedAt,
    command: "native node runner",
    summary,
    failingTests,
  };
};