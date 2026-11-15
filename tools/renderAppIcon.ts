import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import {
  encodeIcns,
  encodeIco,
  encodeIcoBitmap,
  ICON_SOURCE_DIR,
  ICON_SOURCES,
  iconSourceHash,
  LINUX_SIZES,
  MAC_ARTWORK_SCALE,
  MAC_SIZES,
  sourceForSize,
  WINDOWS_SIZES,
  type IconSource,
} from './appIcon.ts';

/**
 * Draws the app icon for every system: npm run icon:render
 *
 * Reads the SVG sources in assets/art/app-icon/ and writes build/icons/<n>x<n>.png,
 * build/icon.ico, build/icon.icns, and build/icon-source.sha256, which a unit test compares
 * with the sources. Chromium draws the SVG, as it does for the coloring pages. The first run on
 * a machine may need `npx playwright install chromium`. Look at the 16, 32, 48, and 256 px
 * images after a change.
 */

export const BUILD_DIR = 'build';
export const SOURCE_HASH_FILE = path.join(BUILD_DIR, 'icon-source.sha256');

async function draw(page: Page, svg: string, size: number, artworkScale: number): Promise<Buffer> {
  const artwork = Math.round(size * artworkScale);
  const inset = (size - artwork) / 2;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:transparent">
      <img style="position:absolute;left:${inset}px;top:${inset}px;width:${artwork}px;height:${artwork}px"
        src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">
    </body></html>`,
  );
  // The tools project has no DOM types, so the page code is a string.
  await page.waitForFunction('document.images[0]?.complete === true');
  return page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}

if (import.meta.main) {
  const sources: Record<IconSource, string> = {
    full: readFileSync(path.join(ICON_SOURCE_DIR, ICON_SOURCES.full), 'utf8'),
    small: readFileSync(path.join(ICON_SOURCE_DIR, ICON_SOURCES.small), 'utf8'),
  };
  mkdirSync(path.join(BUILD_DIR, 'icons'), { recursive: true });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    const flat = new Map<number, Buffer>();
    for (const size of new Set([...LINUX_SIZES, ...WINDOWS_SIZES])) {
      flat.set(size, await draw(page, sources[sourceForSize(size)], size, 1));
    }
    for (const size of LINUX_SIZES) {
      const png = flat.get(size);
      if (png !== undefined) writeFileSync(path.join(BUILD_DIR, 'icons', `${size}x${size}.png`), png);
    }

    const ico = WINDOWS_SIZES.map((size) => {
      const png = flat.get(size);
      if (png === undefined) throw new Error(`No ${size} px drawing`);
      if (size === 256) return { size, data: png };
      const decoded = PNG.sync.read(png);
      return { size, data: encodeIcoBitmap({ width: size, height: size, data: decoded.data }) };
    });
    writeFileSync(path.join(BUILD_DIR, 'icon.ico'), encodeIco(ico));

    const mac = new Map<number, Uint8Array>();
    for (const size of MAC_SIZES) mac.set(size, await draw(page, sources.full, size, MAC_ARTWORK_SCALE));
    writeFileSync(path.join(BUILD_DIR, 'icon.icns'), encodeIcns(mac));
  } finally {
    await browser.close();
  }
  writeFileSync(SOURCE_HASH_FILE, `${iconSourceHash(sources)}\n`);
  console.log(`Wrote the app icon to ${BUILD_DIR}/.`);
}
