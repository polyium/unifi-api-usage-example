export default {
    transform: {
        "^.+\\.ts?$": "ts-jest"
    },
    clearMocks: true,
    collectCoverage: true,
    coverageDirectory: "coverage",
    coverageProvider: "v8",
    testEnvironment: "node",
    preset: "ts-jest",
    testTimeout: 10000,
    testMatch: ["**/*.test.ts"]
}
