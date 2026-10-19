import { defineConfig, devices } from '@playwright/test'

const DEV_PORT = 4310
const PREVIEW_PORT = 4311

// Both servers are checked: the dev server and the production build (`vite preview`)
// must each send the security headers.
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'dev',
      testIgnore: '**/scenarios/**',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${String(DEV_PORT)}` },
    },
    {
      name: 'preview',
      testIgnore: '**/scenarios/**',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${String(PREVIEW_PORT)}` },
    },
    {
      // Multi-actor scenarios: several browser contexts (host, guests, guardians, heir) on a simulated
      // chain, against the production build. They run in real time (demo-mode timers), so they are
      // slow and kept apart from the quick checks. Run with `npm run test:scenarios`.
      name: 'scenarios',
      testMatch: '**/scenarios/**/*.spec.ts',
      timeout: 420_000,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${String(PREVIEW_PORT)}` },
    },
  ],
  webServer: [
    {
      command: `npm run dev -- --port ${String(DEV_PORT)} --strictPort`,
      url: `http://localhost:${String(DEV_PORT)}`,
      reuseExistingServer: !process.env['CI'],
    },
    {
      command: `npm run build && npm run preview -- --port ${String(PREVIEW_PORT)} --strictPort`,
      url: `http://localhost:${String(PREVIEW_PORT)}`,
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
    },
  ],
})
