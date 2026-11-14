import { describe, expect, it } from 'vitest';
import { findNodePinProblems } from './checkNodeVersion.ts';

function input(change: { nodeVersionFile?: string; engines?: unknown; typesNode?: string | undefined } = {}) {
  const typesNode = 'typesNode' in change ? change.typesNode : '24.19.2';
  return {
    nodeVersionFile: change.nodeVersionFile ?? '24.22.2\n',
    packageJson: {
      engines: 'engines' in change ? change.engines : { node: '24.22.2' },
      devDependencies: typesNode === undefined ? {} : { '@types/node': typesNode },
    },
  };
}

describe('findNodePinProblems', () => {
  it('accepts matching pins', () => {
    expect(findNodePinProblems(input())).toEqual([]);
  });

  it.each([
    ['engines pins another patch', { engines: { node: '24.22.1' } }, 'engines.node is "24.22.1"'],
    ['engines uses a range', { engines: { node: '>=24' } }, 'engines.node is ">=24"'],
    ['engines is missing', { engines: undefined }, 'engines.node is "undefined"'],
    ['.node-version is a range', { nodeVersionFile: 'lts/*' }, '.node-version must hold one exact version'],
    ['@types/node is another major', { typesNode: '26.6.6' }, '@types/node is "26.6.6"'],
    ['@types/node is missing', { typesNode: undefined }, '@types/node is "undefined"'],
  ])('reports when %s', (_label, change, reason) => {
    expect(findNodePinProblems(input(change))).toContainEqual(expect.stringContaining(reason));
  });

  it('rejects a package.json whose engines field is not an object', () => {
    expect(() => findNodePinProblems(input({ engines: '24.22.2' }))).toThrow(/engines/);
  });
});
