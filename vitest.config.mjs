// vitest.config.mjs
// Keep agent/scratch worktrees under .claude/ out of the sweep: their copies of
// the suite double-count results and fail once their base drifts from main.
import { configDefaults, defineConfig } from 'vitest/config';
import { transformWithOxc } from 'vite';

export default defineConfig({
  plugins: [{
    name: 'review-page-jsx',
    enforce: 'pre',
    transform(code, id) {
      // Next supports JSX in Pages Router .js files; compile this page for its
      // integration tests before Vite's plain-JavaScript import analysis.
      if (id.endsWith('/pages/review.js')) {
        return transformWithOxc(code, id, { lang: 'jsx' });
      }
      return null;
    },
  }],
  test: {
    exclude: [...configDefaults.exclude, '.claude/**'],
  },
});
