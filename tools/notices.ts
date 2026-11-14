import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { MANIFEST_NAME, parseLicenseManifest } from './licenseManifest.ts';

/**
 * The third-party notices the app ships, from "Assets and licenses" in docs/architecture.md. The
 * bundler drops the legal comments of the code it bundles, and an asset's license travels only in
 * the repository, so the build writes every license text the app needs into one plain text file.
 * The renderer build carries it as `third-party-notices.txt`, the packaged app also keeps a copy
 * beside its program files, and the parent corner shows it.
 *
 * `buildNotices` reads the repository and returns the text and every problem. check:notices fails
 * on any problem, so a new dependency or asset without a notice cannot ship.
 */

export const NOTICES_FILE_NAME = 'third-party-notices.txt';

/** The author LICENSES.json names for the project's own work, which the project's LICENSE covers. */
export const PROJECT_AUTHOR = 'Wild Flowers Tech';

/** File names that hold a license or notice text, in a package or an asset folder. */
const LICENSE_TEXT_FILE = /^(?:licen[cs]e|copying|notice|ofl)(?:[.-][\w.-]*)?$/i;

/** The runtime the packaged app ships although package.json lists it for development. */
const RUNTIME_PACKAGES = ['electron'];

const MIT_TERMS = `Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

/**
 * Packages that ship no license file. Each states its license in package.json and its README, and
 * the notice is the standard text of that license with the copyright holder package.json names.
 * A fallback whose package left the tree, or whose license changed, is a problem.
 */
export type FallbackNotices = Readonly<Record<string, { license: 'MIT'; holder: string }>>;

const FALLBACKS: FallbackNotices = {
  'react-remove-scroll-bar': { license: 'MIT', holder: 'Anton Korzunov' },
};

const lockSchema = z.object({
  packages: z.record(
    z.string(),
    z.object({
      version: z.string().optional(),
      dev: z.boolean().optional(),
      link: z.boolean().optional(),
      optional: z.boolean().optional(),
      license: z.string().optional(),
    }),
  ),
});

export interface NoticeProblem {
  readonly where: string;
  readonly detail: string;
}

interface Section {
  readonly title: string;
  readonly body: string;
}

const RULE = '='.repeat(72);
const THIN_RULE = '-'.repeat(72);

function licenseTextFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && LICENSE_TEXT_FILE.test(entry.name))
    .map((entry) => entry.name)
    .toSorted();
}

const readText = (file: string) => readFileSync(file, 'utf8').replaceAll('\r\n', '\n').trim();

function packageSections(root: string, fallbacks: FallbackNotices, problems: NoticeProblem[]): Section[] {
  const lockPath = path.join(root, 'package-lock.json');
  const lock = lockSchema.parse(JSON.parse(readFileSync(lockPath, 'utf8')));
  const keys = Object.entries(lock.packages)
    .filter(([key, info]) => key !== '' && info.dev !== true && info.link !== true)
    .map(([key]) => key);
  for (const runtime of RUNTIME_PACKAGES) keys.push(`node_modules/${runtime}`);
  const fallbacksUsed = new Set<string>();

  const sections = [...new Set(keys)].toSorted().flatMap((key): Section[] => {
    const info = lock.packages[key];
    const name = key.slice(key.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const dir = path.join(root, key);
    if (!existsSync(dir)) {
      // An optional package for another operating system is not installed here and not shipped.
      if (info?.optional !== true) problems.push({ where: key, detail: 'is not installed; run npm ci' });
      return [];
    }
    const license = info?.license ?? 'no license field';
    const heading = `${name} ${info?.version ?? ''}`.trim();
    const files = licenseTextFiles(dir);
    if (files.length > 0) {
      const texts = files.map((file) => readText(path.join(dir, file))).join(`\n\n${THIN_RULE}\n\n`);
      return [{ title: `${heading} (${license})`, body: texts }];
    }
    const fallback = fallbacks[name];
    if (fallback !== undefined && fallback.license === license) {
      fallbacksUsed.add(name);
      return [
        { title: `${heading} (${license})`, body: `MIT License\n\nCopyright (c) ${fallback.holder}\n\n${MIT_TERMS}` },
      ];
    }
    problems.push({
      where: key,
      detail: `ships no license text file and has no fallback notice (license: ${license})`,
    });
    return [];
  });

  for (const name of Object.keys(fallbacks)) {
    if (!fallbacksUsed.has(name)) {
      problems.push({
        where: `tools/notices.ts`,
        detail: `the fallback notice for ${name} matches no shipped package`,
      });
    }
  }
  return sections;
}

function assetSections(root: string, problems: NoticeProblem[]): { credits: Section[]; texts: Section[] } {
  const assets = path.join(root, 'assets');
  const manifests = existsSync(assets)
    ? readdirSync(assets, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name === MANIFEST_NAME)
        .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)).split(path.sep).join('/'))
        .toSorted()
    : [];
  const credits: Section[] = [];
  const textFiles = new Set<string>();

  for (const manifest of manifests) {
    const folder = path.posix.dirname(manifest);
    const entries = parseLicenseManifest(readFileSync(path.join(root, manifest), 'utf8'));
    if (entries === null) {
      problems.push({ where: manifest, detail: 'is not a valid license manifest; check:licenses says why' });
      continue;
    }
    // A license text applies to its own folder and every folder below it, so the Kokoro notice in
    // assets/voice/ goes with the clips in assets/voice/en/.
    const folderTexts = ancestors(folder).flatMap((dir) =>
      licenseTextFiles(path.join(root, dir)).map((file) => `${dir}/${file}`),
    );
    for (const file of folderTexts) textFiles.add(file);
    for (const entry of entries) {
      if (LICENSE_TEXT_FILE.test(entry.files)) continue;
      const own = entry.author === PROJECT_AUTHOR;
      if (!own && folderTexts.length === 0) {
        problems.push({
          where: `${manifest} "${entry.files}"`,
          detail: `is by ${entry.author}, and its folder holds no license text file to ship with it`,
        });
      }
      const covered = [...(own ? ['the Wild Kids - Computers license at the end'] : []), ...folderTexts].join(', ');
      credits.push({
        title: `${folder}/${entry.files}`,
        body: [
          `Author: ${entry.author}`,
          `License: ${entry.license}`,
          `Source: ${entry.source}`,
          `License text: ${covered}`,
        ].join('\n'),
      });
    }
  }
  const texts = [...textFiles].toSorted().map((file) => ({ title: file, body: readText(path.join(root, file)) }));
  return { credits, texts };
}

/** `assets/voice/en` and the folders above it inside assets/, nearest first. */
function ancestors(folder: string): string[] {
  const parts = folder.split('/');
  return parts.slice(1).map((_part, index) => parts.slice(0, parts.length - index).join('/'));
}

function render(title: string, sections: readonly Section[]): string {
  const parts = sections.map((section) => `${section.title}\n${THIN_RULE}\n${section.body}`);
  return `${RULE}\n${title}\n${RULE}\n\n${parts.join('\n\n\n')}`;
}

/** The notices text for the repository at `root`, and every problem that keeps it from being complete. */
export function buildNotices(
  root: string,
  fallbacks: FallbackNotices = FALLBACKS,
): { text: string; problems: NoticeProblem[] } {
  const problems: NoticeProblem[] = [];
  const packages = packageSections(root, fallbacks, problems);
  const { credits, texts } = assetSections(root, problems);
  const projectLicense = path.join(root, 'LICENSE');
  if (!existsSync(projectLicense)) problems.push({ where: 'LICENSE', detail: 'the project license is missing' });
  // One line per paragraph, so the parent corner can wrap it to any width.
  const intro = [
    'Wild Kids - Computers: third-party notices',
    '',
    'Wild Kids - Computers is free software under the MIT License, printed at the end. It is built with the software, art, fonts, and voice listed here, each under the license that follows it.',
    '',
    'Electron and Chromium, which run the app, ship their own notices beside the program files in LICENSE.electron.txt and LICENSES.chromium.html.',
  ].join('\n');
  const text = [
    intro,
    render('Software in the app', packages),
    render('Art, fonts, and voice', credits),
    render('License texts for art, fonts, and voice', texts),
    render(
      'Wild Kids - Computers',
      existsSync(projectLicense) ? [{ title: 'LICENSE', body: readText(projectLicense) }] : [],
    ),
  ].join('\n\n\n');
  return { text: `${text}\n`, problems };
}
