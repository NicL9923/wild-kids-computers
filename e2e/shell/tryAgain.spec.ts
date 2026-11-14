import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { strings as activityShellStrings } from '../../src/activityShell/strings.ts';
import { ACTIVITY_PATH } from '../../src/activityShell/paths.ts';
import { ACTIVITY_LOAD_DEADLINE_MS } from '../../src/activityShell/timing.ts';
import { strings as homeStrings } from '../../src/app/home/strings.ts';
import { SCREEN_LOAD_DEADLINE_MS } from '../../src/app/lazyScreen.ts';
import { strings as shellStrings } from '../../src/app/shell/strings.ts';
import { strings as startStrings } from '../../src/app/start/strings.ts';
import { BANDS, type Band } from '../../src/core/bands.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { readAudioLog } from '../support/audioLog.ts';
import { FIXTURE_PROFILE, launchApp, type LaunchedApp } from '../support/launchApp.ts';
import { resizeWindow, saveScreen, WINDOW_SIZES } from '../support/screens.ts';
import { homeMap, waitForHome } from './shellSupport.ts';

/** The smallest target per band, from src/styles/tokens.css. */
const TARGET_MIN: Record<Band, number> = { 'band-3-5': 72, 'band-6-8': 56, 'band-9-12': 44 };

let launched: LaunchedApp;

test.afterEach(async () => {
  await launched.close();
});

/**
 * Holds back the stylesheets whose address contains `fragment`, as a disk that stopped answering
 * would, until `release` lets them load. The bundle's loader waits for them before it runs the
 * screen's code, so the screen's load hangs. It touches only the page's edge where files are read.
 */
async function holdStylesheets(page: Page, fragment: string): Promise<{ release: () => Promise<void> }> {
  await page.evaluate((held) => {
    const head = document.head;
    const waiting: Node[] = [];
    const appendNow = head.appendChild.bind(head);
    Reflect.set(window, 'wkcReleaseStylesheets', () => {
      Reflect.deleteProperty(head, 'appendChild');
      for (const node of waiting.splice(0)) appendNow(node);
    });
    Object.defineProperty(head, 'appendChild', {
      configurable: true,
      value: (node: Node): Node => {
        if (node instanceof HTMLLinkElement && node.href.includes(held)) {
          waiting.push(node);
          return node;
        }
        return appendNow(node);
      },
    });
  }, fragment);
  return {
    release: () =>
      page.evaluate(() => {
        const release: unknown = Reflect.get(window, 'wkcReleaseStylesheets');
        if (typeof release === 'function') release();
      }),
  };
}

/** Every visible control is at least the band's smallest target. */
async function expectTargets(page: Page, band: Band): Promise<void> {
  for (const control of await page.getByRole('button').all()) {
    const box = await control.boundingBox();
    if (box === null) continue;
    expect(Math.min(box.width, box.height), (await control.getAttribute('aria-label')) ?? '').toBeGreaterThanOrEqual(
      TARGET_MIN[band],
    );
  }
}

async function expectSpoken(page: Page, id: string): Promise<void> {
  await expect.poll(async () => (await readAudioLog(page)).map((entry) => entry.name)).toContain(id);
}

async function openHash(page: Page, hash: string): Promise<void> {
  await page.evaluate((target) => {
    window.location.hash = target;
  }, hash);
}

for (const band of BANDS) {
  test(`at ${band}, a game whose code does not load gets a calm try-again screen, and plays on try again`, async () => {
    launched = await launchApp({ band });
    const { page } = launched;
    await waitForHome(page);
    const held = await holdStylesheets(page, 'MemoryPairsActivity-');
    await openHash(page, `#${ACTIVITY_PATH('memory-pairs')}`);

    const heading = page.getByRole('heading', { level: 1, name: activityShellStrings.notOpened.text });
    await expect(heading).toBeVisible({ timeout: ACTIVITY_LOAD_DEADLINE_MS + 5_000 });
    await expectSpoken(page, activityShellStrings.notOpened.id);
    await expect(page.getByRole('button', { name: activityShellStrings.exitToArea.text })).toBeVisible();
    await expect(page.getByRole('button', { name: activityShellStrings.soundOff.text })).toBeVisible();
    await expectTargets(page, band);
    await expectAccessible(page);
    for (const size of WINDOW_SIZES) {
      await resizeWindow(launched, size);
      await saveScreen(page, band, 'shell-activity-not-opened');
    }

    // The load that answers after the deadline does not replace the screen.
    await held.release();
    await expect(heading).toBeVisible();
    await page.getByRole('button', { name: shellStrings.tryAgain.text }).click();
    await expect(heading).toBeHidden();
    await expect(
      page
        .locator(
          '[data-activity="memory-pairs"] [data-carry-item], [data-activity="memory-pairs"] .wk-activity-stage button',
        )
        .first(),
    ).toBeVisible();
  });

  test(`at ${band}, a place whose code does not load gets a calm try-again screen with the way back`, async () => {
    launched = await launchApp({ band });
    const { page } = launched;
    await waitForHome(page);
    const held = await holdStylesheets(page, 'paintStudio-');
    await page.getByRole('button', { name: homeStrings['place-paint-studio'].text }).click();

    const heading = page.getByRole('heading', { level: 1, name: shellStrings.notOpened.text });
    await expect(heading).toBeVisible({ timeout: SCREEN_LOAD_DEADLINE_MS + 5_000 });
    await expectSpoken(page, shellStrings.notOpened.id);
    await expectTargets(page, band);
    await expectAccessible(page);
    for (const size of WINDOW_SIZES) {
      await resizeWindow(launched, size);
      await saveScreen(page, band, 'shell-place-not-opened');
    }

    // The load that answers after the deadline does not replace the screen.
    await held.release();
    await expect(heading).toBeVisible();
    await page.getByRole('button', { name: shellStrings.tryAgain.text }).click();
    await expect(heading).toBeHidden();
    await expect(page.locator('.wk-paint-screen canvas').first()).toBeVisible();
  });
}

const profilesFile = (dataDir: string) => path.join(dataDir, 'profiles.json');

test('when the saved profiles cannot be read, the app says so calmly, keeps them, and opens them on try again', async () => {
  launched = await launchApp(
    { band: 'band-9-12' },
    {
      // A folder where the file should be: the main process refuses to read it, as a broken disk would.
      prepare: async (dataDir) => {
        await rm(profilesFile(dataDir));
        await mkdir(profilesFile(dataDir));
      },
    },
  );
  const { page, dataDir } = launched;
  const heading = page.getByRole('heading', { level: 1, name: startStrings.unavailable.text });
  await expect(heading).toBeVisible();
  await expectSpoken(page, startStrings.unavailable.id);
  // Before a child is known, the youngest band's look and targets.
  await expect(page.locator('[data-band="band-3-5"]').first()).toBeAttached();
  await expectTargets(page, 'band-3-5');
  await expectAccessible(page);
  for (const size of WINDOW_SIZES) {
    await resizeWindow(launched, size);
    await saveScreen(page, 'band-3-5', 'shell-saved-things-unavailable');
  }

  await rm(profilesFile(dataDir), { recursive: true });
  await writeFile(
    profilesFile(dataDir),
    JSON.stringify({ version: 1, profiles: [{ ...FIXTURE_PROFILE, band: 'band-9-12' }] }),
  );
  await page.getByRole('button', { name: shellStrings.tryAgain.text }).click();
  await expect(homeMap(page)).toBeVisible();
});
