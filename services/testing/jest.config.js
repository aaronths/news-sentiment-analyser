const { createDefaultPreset } = require("ts-jest");

const tsJestTransformCfg = createDefaultPreset().transform;

/** @type {import("jest").Config} **/
module.exports = {
  testEnvironment: "node",
  transform: {
    ...tsJestTransformCfg,
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