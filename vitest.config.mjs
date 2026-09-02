// vitest.config.mjs
// Keep agent/scratch worktrees under .claude/ out of the sweep: their copies of
// the suite double-count results and fail once their base drifts from main.
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
});
