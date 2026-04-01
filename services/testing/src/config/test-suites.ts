// This file defines the test suites and provides functions to list available suites and resolve test files for a given suite

// get the list of test files for each suite
export const testSuites: Record<string, string[]> = {
  sentiment: ["src/tests/sentiment.test.ts"],
};

export const listSuites = (): string[] => Object.keys(testSuites);

// turn a suite name into a list of test files to run
export const resolveSuiteFiles = (suite?: string): string[] => {
  if (!suite || suite === "all") {
    const all = Object.values(testSuites).flat();
    return Array.from(new Set(all));
  }

  const suiteKey = suite.toLowerCase();
  const files = testSuites[suiteKey];
  if (!files) {
    throw new Error(`Unknown suite '${suite}'. Available suites: ${listSuites().join(", ")}`);
  }

  return files;
};
