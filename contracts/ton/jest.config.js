module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.spec.ts"],
  collectCoverageFrom: [
    "contracts/**/*.ts",
    "wrappers/**/*.ts"
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov"],
  testTimeout: 10000
};