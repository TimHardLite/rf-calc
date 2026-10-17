import { defineConfig } from 'vitest/config';

// Only product tests; temp contains historical source copies for comparison.
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
