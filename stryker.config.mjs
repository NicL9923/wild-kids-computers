const config = {
  packageManager: 'npm',
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  vitest: { configFile: 'vite.config.ts' },
  // docs/architecture.md: paint math, level generators, the difficulty model, and storage
  // validation. All of them live in src/core.
  mutate: ['src/core/**/*.ts', '!src/core/**/*.test.ts'],
  coverageAnalysis: 'perTest',
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  thresholds: { high: 90, low: 80, break: 80 },
  tempDirName: '.stryker-tmp',
  cleanTempDir: 'always',
  // Stryker rewrites tsconfig paths that point outside its sandbox, using the TypeScript JS API.
  // TypeScript 7 has no JS API, and no tsconfig here points outside the repository, so point
  // the rewrite at a file that does not exist and Stryker skips it.
  tsconfigFile: 'stryker-skips-tsconfig-rewrite.json',
};

export default config;
