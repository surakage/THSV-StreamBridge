import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Windows archive extraction, antivirus inspection, and the fake-timer media
    // lifecycle can exceed five seconds when all test files run in parallel.
    // Keep the bound finite while avoiding scheduler-contention false failures.
    testTimeout: 15_000,
    hookTimeout: 15_000,
    pool: 'forks',
    sequence: { concurrent: false },
  },
});
