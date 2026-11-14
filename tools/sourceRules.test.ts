import { describe, expect, it } from 'vitest';
import { findCoreImportEscapes, findJsxAttributeLiterals, importSpecifiers, readSourceTree } from './sourceRules.ts';

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

describe('the source tree', () => {
  const files = readSourceTree(process.cwd(), 'src');

  it('keeps src/core imports inside src/core', () => {
    expect(findCoreImportEscapes(files)).toEqual([]);
  });

  it('has no user-facing JSX attribute literals', () => {
    expect(findJsxAttributeLiterals(files)).toEqual([]);
  });
});
