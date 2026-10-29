import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['json', { outputFile: 'docs/browser-test-results.json' }]],
  outputDir: 'test-results',
  use: {
    baseURL: process.env.PW_BASE_URL || 'http://127.0.0.1:5173',
    viewport: { width: 1440, height: 1000 },
    locale: 'ru-RU',
    colorScheme: 'dark',
    headless: true,
    launchOptions: {
      executablePath: process.env.CHROME_BIN || '/usr/bin/google-chrome',
      args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    },
    trace: 'retain-on-failure',
  },
})
