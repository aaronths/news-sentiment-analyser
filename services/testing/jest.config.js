const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  // roots: ["<rootDir>/dist"],
  // Change for development to src, for production to dist
  roots: ["<rootDir>/src"],
  // same change here for development and production
  // testMatch: ["**/*.test.js"],
  testMatch: ["**/*.test.ts"],
  // Same change here for development and production
  // transform: {
  //   ...tsJestTransformCfg,
  // },
  transform: {
    // This tells Jest to use ts-jest for any .ts files
    "^.+\\.tsx?$": ["ts-jest", {
      // This forces ts-jest to use the local compiler
      isolatedModules: true,
    }],
  },
  testTimeout: 30000, // global test timeout of 30 seconds
  reporters: [
    "default",
    ["jest-html-reporters", {
      "publicPath": "./report",
      "filename": "report.html"
    }]
  ]
};