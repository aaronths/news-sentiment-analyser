module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/tests/**/*.test.ts"],
  // unit.test.ts and collection.test.ts both write repo-root data/raw-articles.json; parallel files race.
  maxWorkers: 1,
};


