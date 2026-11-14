import { readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

/**
 * Node is pinned in two places: .node-version, which fnm, CI, and other version managers read,
 * and package.json engines, which npm enforces through engine-strict in .npmrc. Paint goldens
 * depend on Node's math library, so the two must agree. @types/node must match the major
 * version, or code can type check against Node APIs that do not exist at runtime.
 */

const packageJsonSchema = z.object({
  engines: z.object({ node: z.string().optional() }).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
});

export function findNodePinProblems(input: { nodeVersionFile: string; packageJson: unknown }): string[] {
  const pkg = packageJsonSchema.parse(input.packageJson);
  const problems: string[] = [];
  const pinned = input.nodeVersionFile.trim();
  if (!/^\d+\.\d+\.\d+$/.test(pinned)) {
    problems.push(`.node-version must hold one exact version such as 24.22.2, found "${pinned}".`);
  }

  const engine = pkg.engines?.node;
  if (engine !== pinned) {
    problems.push(`package.json engines.node is "${String(engine)}" but .node-version is "${pinned}".`);
  }

  const pinnedMajor = pinned.split('.')[0];
  const typesNode = pkg.devDependencies?.['@types/node'];
  if (typesNode?.split('.')[0] !== pinnedMajor) {
    problems.push(
      `@types/node is "${String(typesNode)}" but Node is ${pinned}. Use the latest @types/node ${pinnedMajor}.x.`,
    );
  }
  return problems;
}

if (import.meta.main) {
  const root = process.cwd();
  const problems = findNodePinProblems({
    nodeVersionFile: readFileSync(path.join(root, '.node-version'), 'utf8'),
    packageJson: JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')),
  });
  if (problems.length > 0) {
    console.error('check:node-version failed.');
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log('check:node-version passed.');
}
