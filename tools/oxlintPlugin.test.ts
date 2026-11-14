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

function lint(relative: string, text = PROBE): { rule: string; line: number }[] {
  const file = path.join(project, relative);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
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

const DRAG_PROBE = [
  'export function Probe({ el }: { el: HTMLElement }) {',
  '  el.setPointerCapture(1);',
  '  return (',
  '    <div>',
  '      <img draggable alt="" />',
  '      <img draggable={true} alt="" />',
  '      <img draggable={false} alt="" />',
  '      <div onDragStart={() => undefined} onDragEnd={() => undefined} />',
  '      <div onPointerDown={() => undefined} />',
  '    </div>',
  '  );',
  '}',
].join('\n');

describe('the native drag lint rule', () => {
  it('bans draggable, onDrag handlers, and pointer capture in activities, and allows draggable={false}', () => {
    const rules = lint('src/features/computer-skills/activities/probe/ProbeActivity.tsx', DRAG_PROBE).filter(
      (d) => d.rule === 'wkc(no-native-drag)',
    );
    expect(rules.map((d) => d.line)).toEqual([2, 5, 6, 8, 8]);
  });

  it.each(['src/activityShell/carry/Probe.tsx', 'src/features/paint-studio/Probe.tsx'])(
    'leaves the exempt path %s alone',
    (relative) => {
      expect(lint(relative, DRAG_PROBE).filter((d) => d.rule === 'wkc(no-native-drag)')).toEqual([]);
    },
  );
});
