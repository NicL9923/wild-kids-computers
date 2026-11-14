import { describe, expect, it } from 'vitest';
import {
  findCoreImportEscapes,
  findJsxAttributeLiterals,
  findRouteLiterals,
  importSpecifiers,
  readSourceTree,
  ROUTE_OWNERS,
} from './sourceRules.ts';

describe('importSpecifiers', () => {
  it('reads static, re-export, side-effect, type, and dynamic imports', () => {
    const text = [
      "import a from './a.ts';",
      "import type { B } from '../b.ts';",
      "export { c } from './c.ts';",
      "import './d.css';",
      "const e = await import('./e.ts');",
      'import {\n  f,\n  g,\n} from "./fg.ts";',
    ].join('\n');
    expect(importSpecifiers(text)).toEqual(['./a.ts', '../b.ts', './c.ts', './d.css', './e.ts', './fg.ts']);
  });
});

describe('findCoreImportEscapes', () => {
  it('allows imports that stay inside src/core and package imports', () => {
    const file = {
      path: 'src/core/paint/tools/brush/index.ts',
      text: "import { a } from '../../engine.ts';\nimport { z } from 'zod';",
    };
    expect(findCoreImportEscapes([file])).toEqual([]);
  });

  it('reports a relative import that leaves src/core', () => {
    const file = { path: 'src/core/paint/engine.ts', text: "import { x } from '../../app/router.ts';" };
    expect(findCoreImportEscapes([file])).toEqual([
      { path: file.path, detail: 'import "../../app/router.ts" resolves to src/app/router.ts' },
    ]);
  });

  it('reports a dynamic import that leaves src/core', () => {
    const file = { path: 'src/core/bands.ts', text: "await import('../features/x.ts');" };
    expect(findCoreImportEscapes([file]).map((f) => f.detail)).toEqual([
      'import "../features/x.ts" resolves to src/features/x.ts',
    ]);
  });

  it('reports a root-absolute import', () => {
    const file = { path: 'src/core/bands.ts', text: "import x from '/src/app/x.ts';" };
    expect(findCoreImportEscapes([file]).map((f) => f.detail)).toEqual(['root-absolute import "/src/app/x.ts"']);
  });

  it('ignores files outside src/core', () => {
    const file = { path: 'src/app/router.ts', text: "import x from '../../electron/main/index.ts';" };
    expect(findCoreImportEscapes([file])).toEqual([]);
  });
});

describe('findJsxAttributeLiterals', () => {
  it.each([
    ['aria-label in quotes', '<button aria-label="Close" />', 'aria-label'],
    ['alt in braces', "<img alt={'A fox'} />", 'alt'],
    ['title in a template', '<div title={`Hello`} />', 'title'],
    ['placeholder', "<input placeholder='Name' />", 'placeholder'],
  ])('reports %s', (_label, text, attribute) => {
    const findings = findJsxAttributeLiterals([{ path: 'src/app/X.tsx', text }]);
    expect(findings.map((f) => f.detail.split(' ')[0])).toEqual([attribute]);
  });

  it.each([
    ['a className string', '<div className="grid" />'],
    ['a handle', '<button aria-label={t(strings.close)} />'],
    ['an empty alt for a decorative image', '<img alt="" />'],
    ['a data attribute', '<div data-title="x" />'],
  ])('allows %s', (_label, text) => {
    expect(findJsxAttributeLiterals([{ path: 'src/app/X.tsx', text }])).toEqual([]);
  });

  it('skips test files', () => {
    expect(findJsxAttributeLiterals([{ path: 'src/app/X.test.tsx', text: '<b title="x" />' }])).toEqual([]);
  });
});

describe('findRouteLiterals', () => {
  const owner = {
    path: 'src/features/paint-studio/paths.ts',
    text: "export const PAINT_STUDIO_PATH = '/paint';\nexport const PAINT_GALLERY_PATH = '/paint/gallery';",
  };

  it.each([
    ['a plain path', "navigate({ to: '/paint' });"],
    ['a deeper path', "const to = '/paint/gallery';"],
    ['a hash route in an end-to-end test', "await openRoute(page, '#/paint');"],
    ['a template', 'const to = `/paint?picture=${id}`;'],
  ])('reports %s outside the owner', (_label, text) => {
    const findings = findRouteLiterals([owner, { path: 'e2e/paint/x.ts', text }]);
    expect(findings.map((f) => f.path)).toEqual(['e2e/paint/x.ts']);
  });

  it.each([
    ['a path no owner declares', "const icon = '/painted';"],
    ['a comment', "// Opens '/paint' from the map"],
    ['a block comment', '/** `/paint/gallery` lists pictures */'],
    ['an asset path', "import x from '../paint/a.svg';"],
  ])('allows %s', (_label, text) => {
    expect(findRouteLiterals([owner, { path: 'src/features/x.ts', text }])).toEqual([]);
  });

  it('skips the owner itself and unit tests', () => {
    const unitTest = { path: 'src/app/paths.test.ts', text: "expect(x).toBe('/paint');" };
    expect(findRouteLiterals([owner, unitTest])).toEqual([]);
  });
});

describe('the source tree', () => {
  const files = readSourceTree(process.cwd(), 'src');

  it('keeps src/core imports inside src/core', () => {
    expect(findCoreImportEscapes(files)).toEqual([]);
  });

  it('has no user-facing JSX attribute literals', () => {
    expect(findJsxAttributeLiterals(files)).toEqual([]);
  });

  it('keeps every route literal in its owner', () => {
    const tree = [...files, ...readSourceTree(process.cwd(), 'e2e')];
    expect(tree.filter((file) => ROUTE_OWNERS.includes(file.path))).toHaveLength(ROUTE_OWNERS.length);
    expect(findRouteLiterals(tree)).toEqual([]);
  });
});
