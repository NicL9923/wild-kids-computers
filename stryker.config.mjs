const config = {
  packageManager: 'npm',
  testRunner: 'vitest',
  plugins: ['@stryker-mutator/vitest-runner'],
  vitest: { configFile: 'vite.config.ts' },
  // docs/architecture.md: paint math, level generators, the difficulty model (in
  // src/core/activityKit), and storage
  // validation. All of them live in src/core. From the paint engine, that means the math and the
  // pixel arithmetic: the golden image tests cover the tools, tips, and effects built on them.
  mutate: [
    'src/core/**/*.ts',
    // The toy desktop model, which every toy desktop lesson's level and goal check builds on.
    'src/features/toy-desktop/model/**/*.ts',
    '!src/**/*.test.ts',
    '!src/core/**/testing/**',
    '!src/core/paint/**',
    'src/core/paint/math.ts',
    'src/core/paint/color.ts',
    'src/core/paint/rect.ts',
    'src/core/paint/raster.ts',
    'src/core/paint/recolor.ts',
    'src/core/paint/warp.ts',
    'src/core/paint/scatter.ts',
    'src/features/robot-painter/engine/!(*.test).ts',
    // Every activity's level generator, toy desktop lessons included.
    'src/features/*/activities/*/level.ts',
    'src/features/toy-desktop/lessons/*/level.ts',
  ],
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
