import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

/**
 * Proves the paint math lint rules fire. It copies the repository's Oxlint config into a
 * temporary project, writes probe files, runs Oxlint there, and reads the JSON report.
 */

const root = process.cwd();
const project = mkdtempSync(path.join(tmpdir(), 'wkc-lint-'));
afterAll(() => rmSync(project, { recursive: true, force: true }));

const config = z
  .record(z.string(), z.unknown())
  .parse(JSON.parse(readFileSync(path.join(root, '.oxlintrc.json'), 'utf8')));
config.jsPlugins = [path.join(root, 'tools/oxlintPlugin.ts')];
config.options = { typeAware: false };
delete config.$schema;
writeFileSync(path.join(project, '.oxlintrc.json'), JSON.stringify(config));

const PROBE = [
  'export const a = Math.sin(1);',
  'export const b = Math.atan2(1, 2);',
  'export const c = Math.pow(2, 3);',
  'export const d = 2 ** 3;',
  'let e = 2;',
  'e **= 2;',
  'export { e };',
  'export const f = Math.sqrt(2) + Math.floor(1.5);',
].join('\n');

const reportSchema = z.object({
  diagnostics: z.array(
    z.object({ code: z.string(), labels: z.array(z.object({ span: z.object({ line: z.number() }) })) }),
  ),
});

function lint(relative: string): { rule: string; line: number }[] {
  const file = path.join(project, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, PROBE);
  const result = spawnSync(path.join(root, 'node_modules/.bin/oxlint'), ['--format', 'json', relative], {
    cwd: project,
    encoding: 'utf8',
  });
  const report = reportSchema.parse(JSON.parse(result.stdout));
  return report.diagnostics
    .map((d) => ({ rule: d.code, line: d.labels[0]?.span.line ?? 0 }))
    .toSorted((x, y) => x.line - y.line);
}

describe('paint math lint rules', () => {
  it('ban inexact Math functions and the ** operator under src/core/paint, and allow sqrt and floor', () => {
    expect(lint('src/core/paint/probe.ts')).toEqual([
      { rule: 'eslint(no-restricted-properties)', line: 1 },
      { rule: 'eslint(no-restricted-properties)', line: 2 },
      { rule: 'eslint(no-restricted-properties)', line: 3 },
      { rule: 'wkc(no-exponent-operator)', line: 4 },
      { rule: 'wkc(no-exponent-operator)', line: 6 },
    ]);
  });

  it('leave code outside the paint engine alone', () => {
    expect(lint('src/core/other/probe.ts')).toEqual([]);
  });
});
