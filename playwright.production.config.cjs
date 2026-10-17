module.exports = {
  testDir: "./tests",
  testMatch: "presentation.spec.js",
  workers: 2,
  use: { baseURL: "http://127.0.0.1:8001", headless: true },
  webServer: {
    command: "npm run preview -- --port 8001",
    url: "http://127.0.0.1:8001",
    reuseExistingServer: false,
  },
};
