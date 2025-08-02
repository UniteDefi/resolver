module.exports = {
    preset: "ts-jest",
    testEnvironment: "node",
    testTimeout: 120000,
    transform: {
        "^.+\\.ts$": "ts-jest"
    },
    testMatch: [
        "**/tests/**/*.spec.ts"
    ],
    moduleFileExtensions: ["ts", "js"],
    setupFilesAfterEnv: ["<rootDir>/tests/setup.ts"],
    verbose: true,
    collectCoverageFrom: [
        "wrappers/**/*.ts",
        "utils/**/*.ts",
        "!**/*.d.ts"
    ]
};
