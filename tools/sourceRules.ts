import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Repository rules that Oxlint cannot express. tools/sourceRules.test.ts runs them over the
 * real source tree. Oxlint enforces the rest; see .oxlintrc.json.
 */

export interface SourceFile {
  /** Path relative to the repository root, with forward slashes. */
  path: string;
  text: string;
}

export interface Finding {
  path: string;
  detail: string;
}

const IMPORT_SPECIFIER =
  /\b(?:import|export)\s[^;'"]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\bimport\s+['"]([^'"]+)['"]/g;

export function importSpecifiers(text: string): string[] {
  return [...text.matchAll(IMPORT_SPECIFIER)].map((m) => m[1] ?? m[2] ?? m[3] ?? '').filter(Boolean);
}

/**
 * src/core imports nothing from src/ outside src/core. Oxlint denies react, react-dom, and
 * electron there. This catches relative and root-absolute paths that leave src/core, which a
 * fixed import pattern cannot, because the number of ../ segments depends on the file's depth.
 */
export function findCoreImportEscapes(files: readonly SourceFile[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    if (!file.path.startsWith('src/core/')) continue;
    for (const specifier of importSpecifiers(file.text)) {
      if (specifier.startsWith('/')) {
        findings.push({ path: file.path, detail: `root-absolute import "${specifier}"` });
        continue;
      }
      if (!specifier.startsWith('.')) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file.path), specifier));
      if (!target.startsWith('src/core/')) {
        findings.push({ path: file.path, detail: `import "${specifier}" resolves to ${target}` });
      }
    }
  }
  return findings;
}

// Attributes whose text a person reads or hears. Oxlint's react/jsx-no-literals covers text
// children and string expressions. It cannot single out these attributes without also banning
// className strings, so this scan covers them.
const USER_FACING_ATTRIBUTES = [
  'aria-label',
  'aria-description',
  'aria-roledescription',
  'aria-valuetext',
  'aria-placeholder',
  'alt',
  'title',
  'placeholder',
  'label',
];

const ATTRIBUTE_LITERAL = new RegExp(
  `(?<![\\w-])(${USER_FACING_ATTRIBUTES.join('|')})\\s*=\\s*(?:\\{\\s*)?(["'\`])(.*?)\\2`,
  'g',
);

/** User-facing JSX attributes set to a non-empty string literal in non-test .tsx files. */
export function findJsxAttributeLiterals(files: readonly SourceFile[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    if (!file.path.endsWith('.tsx') || file.path.endsWith('.test.tsx')) continue;
    for (const match of file.text.matchAll(ATTRIBUTE_LITERAL)) {
      if ((match[3] ?? '').trim() === '') continue;
      findings.push({ path: file.path, detail: `${match[1]} is a string literal: ${match[0]}` });
    }
  }
  return findings;
}

export function readSourceTree(root: string, dir: string): SourceFile[] {
  return readdirSync(path.join(root, dir), { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .map((file) => {
      const relative = path.posix.join(dir, file.split(path.sep).join('/'));
      return { path: relative, text: readFileSync(path.join(root, relative), 'utf8') };
    });
}
