const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
    testDir: ".",
    testMatch: "*.spec.js",
    fullyParallel: true,
    retries: 0,
    reporter: "list",
    use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 }
    }
});
