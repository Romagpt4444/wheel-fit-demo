import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  timeout: 60_000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    // E2E_URL=https://romagpt4444.github.io/wheel-fit-demo/ runs the same suite against the live site
    baseURL: process.env.E2E_URL ?? 'http://localhost:4173/wheel-fit-demo/',
    trace: 'retain-on-failure',
  },
  webServer: process.env.E2E_URL
    ? undefined
    : {
        command: 'npm run build && npx vite preview --port 4173 --strictPort',
        url: 'http://localhost:4173/wheel-fit-demo/',
        reuseExistingServer: false,
        timeout: 120_000,
      },
  projects: [
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    { name: 'desktop', use: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 } },
  ],
});
