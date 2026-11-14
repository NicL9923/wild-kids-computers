import { expect, test, type Page } from '@playwright/test';
import { strings as closingStrings } from '../../src/app/closing/strings.ts';
import { ACTIVITY_PATH } from '../../src/activityShell/paths.ts';
import { strings as pageNames } from '../../src/features/paint-studio/coloringPages/strings.ts';
import { PAINT_GALLERY_PATH } from '../../src/features/paint-studio/paths.ts';
import { strings } from '../../src/features/paint-studio/strings.ts';
import { appDocument } from '../../src/core/storage/schemas.ts';
import { readAudioLog } from '../support/audioLog.ts';
import { advanceClock } from '../support/clock.ts';
import { FIXTURE_PROFILE, launchApp, restartApp, type LaunchedApp } from '../support/launchApp.ts';
import { answerGate, gateDialog, savedProfiles, waitForHome, wordGateAnswer } from '../shell/shellSupport.ts';
import { frames, galleryIds, openRoute, openStudio, resizeWindow, screenPoint } from './studioSupport.ts';

// Every way of leaving the studio keeps the picture. Each test paints and leaves at once, inside
// the autosave pause, often with the pen still down, then starts the app again the way a child
// comes back the next day and finds the picture in the gallery.

let launched: LaunchedApp;

test.afterEach(async () => {
  await launched.close();
});

const BAND = 'band-3-5';
const RED = [220, 38, 38, 255];

async function start(): Promise<Page> {
  launched = await launchApp({ band: BAND });
  await resizeWindow(launched, { width: 1920, height: 1080 });
  await openStudio(launched.page);
  return launched.page;
}

const button = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

/**
 * Paints a line with the sticky pen: a click puts it down and a move paints. With `lift`, a
 * second click ends the stroke; without it the pen stays down and the stroke is still open.
 */
async function paintLine(page: Page, y: number, { lift }: { lift: boolean }): Promise<void> {
  const from = await screenPoint(page, 300, y);
  const to = await screenPoint(page, 900, y);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.up();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  if (lift) {
    await page.mouse.down();
    await page.mouse.up();
  }
  await frames(page);
  await expect(page.locator('.wk-paint-frame')).toHaveAttribute('data-pen', lift ? 'up' : 'down');
}

/** Starts the app again on the same saved data, opens the gallery, and counts its pictures. */
async function relaunchAndCount(): Promise<number> {
  launched = await restartApp(launched, { band: BAND });
  await resizeWindow(launched, { width: 1920, height: 1080 });
  await openRoute(launched.page, `#${PAINT_GALLERY_PATH}`);
  const cards = launched.page.getByRole('list', { name: strings.galleryTitle.text }).getByRole('listitem');
  await expect(cards.first()).toBeVisible();
  return cards.count();
}

/** Opens the newest gallery picture and checks the line at y is there. */
async function expectNewestHasLine(y: number): Promise<void> {
  const { page } = launched;
  const cards = page.getByRole('list', { name: strings.galleryTitle.text }).getByRole('listitem');
  await cards.first().getByRole('button', { name: strings.openPicture.text }).click();
  await expect(page.locator('.wk-paint-screen[data-ready="true"]')).toBeVisible();
  await expect.poll(() => pixelOf(page, 600, y)).toEqual(RED);
}

function pixelOf(page: Page, x: number, y: number): Promise<number[]> {
  return page.evaluate(
    ({ px, py }) => {
      const canvas = document.querySelector<HTMLCanvasElement>('canvas[data-layer="paint"]');
      const data = canvas?.getContext('2d')?.getImageData(px, py, 1, 1).data;
      return data === undefined ? [] : [...data];
    },
    { px: x, py: y },
  );
}

test('the exit control keeps an open stroke', async () => {
  const page = await start();
  await paintLine(page, 500, { lift: false });
  await button(page, strings.exit.text).click();
  await waitForHome(page);
  expect(await relaunchAndCount()).toBe(1);
  await expectNewestHasLine(500);
});

test('the gallery button keeps a stroke the pause has not saved yet', async () => {
  const page = await start();
  await paintLine(page, 500, { lift: true });
  await button(page, strings.gallery.text).click();
  await expect(page.getByRole('list', { name: strings.galleryTitle.text })).toBeVisible();
  expect(await relaunchAndCount()).toBe(1);
  await expectNewestHasLine(500);
});

test('new paper keeps the old picture and the new one', async () => {
  const page = await start();
  await paintLine(page, 300, { lift: false });
  await button(page, strings.newPicture.text).click();
  await expect.poll(() => pixelOf(page, 600, 300)).toEqual([255, 255, 255, 255]);
  await paintLine(page, 700, { lift: true });
  await button(page, strings.exit.text).click();
  await waitForHome(page);
  expect(await relaunchAndCount()).toBe(2);
  await expectNewestHasLine(700);
});

test('opening a coloring page keeps the picture painted before it', async () => {
  const page = await start();
  await paintLine(page, 500, { lift: false });
  await button(page, strings.coloringPages.text).click();
  const panel = page.getByRole('dialog', { name: strings.coloringPages.text });
  await panel.getByRole('button', { name: pageNames.duck.text, exact: true }).click();
  await expect(panel).toBeHidden();
  await button(page, strings.exit.text).click();
  await waitForHome(page);
  // The untouched page is not a picture yet; the painting before it is.
  expect(await relaunchAndCount()).toBe(1);
  await expectNewestHasLine(500);
});

test('going back in history keeps an open stroke', async () => {
  const page = await start();
  await paintLine(page, 500, { lift: false });
  await page.evaluate(() => window.history.back());
  await expect(page.locator('.wk-paint-screen')).toHaveCount(0);
  expect(await relaunchAndCount()).toBe(1);
  await expectNewestHasLine(500);
});

test('handing a robot drawing to the studio keeps the picture before it and the drawing', async () => {
  const page = await start();
  await paintLine(page, 500, { lift: false });
  await page.evaluate(
    (hash) => {
      window.location.hash = hash;
    },
    `#${ACTIVITY_PATH('robot-free-draw')}`,
  );
  await expect(page.locator('.rp-screen')).toBeVisible({ timeout: 15_000 });
  await page.locator('[data-arrow="right"]').click();
  await expect(page.locator('.rp-paper')).not.toHaveAttribute('data-lines', '0', { timeout: 10_000 });
  await page.locator('[data-control="paint-it"]').click();
  await expect(page.locator('.wk-paint-screen[data-ready="true"]')).toBeVisible();
  // The drawing is new work: quitting at once still keeps it.
  expect(await relaunchAndCount()).toBe(2);
});

test('the session limit closing keeps a stroke the pause has not saved yet', async () => {
  launched = await launchApp(
    { band: BAND },
    {
      documents: savedProfiles([{ ...FIXTURE_PROFILE, band: BAND }], FIXTURE_PROFILE.id, { sessionLengthMinutes: 15 }),
    },
  );
  const { page } = launched;
  await resizeWindow(launched, { width: 1920, height: 1080 });
  await openStudio(page);
  await paintLine(page, 500, { lift: true });
  await advanceClock(page, 15 * 60_000);
  await expect(page.getByRole('heading', { level: 1, name: closingStrings.heading.text })).toBeVisible();
  expect(await relaunchAndCount()).toBe(1);
});

test('quitting the app keeps an open stroke', async () => {
  const page = await start();
  await paintLine(page, 500, { lift: false });
  expect(await relaunchAndCount()).toBe(1);
  await expectNewestHasLine(500);
});

test('the kiosk close flow keeps a stroke the pause has not saved yet', async () => {
  const documents = savedProfiles([{ ...FIXTURE_PROFILE, band: BAND }], FIXTURE_PROFILE.id);
  documents.app = JSON.stringify({
    ...appDocument.defaults(),
    firstLaunchDone: true,
    lastActiveProfileId: FIXTURE_PROFILE.id,
    kioskLock: true,
  });
  launched = await launchApp({ band: BAND }, { documents });
  const { page } = launched;
  await expect
    .poll(() => launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isKiosk() ?? false))
    .toBe(true);
  await openStudio(page);
  await paintLine(page, 500, { lift: false });
  await launched.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close());
  const gate = gateDialog(page, 'quit');
  await expect(gate).toBeVisible();
  const exited = new Promise<void>((resolve) => launched.app.process().once('exit', () => resolve()));
  await answerGate(page, await wordGateAnswer(page));
  await exited;
  expect(await relaunchAndCount()).toBe(1);
  await expectNewestHasLine(500);
  // The app came back locked. Unlock it so the test can close it without the gate.
  await launched.page.evaluate(() => window.wkcTest?.bridge.window.setKioskLock(false));
});

/** Makes every picture save fail, as a full disk would, or work again, through the app's own bridge. */
async function breakSaves(page: Page, broken: boolean): Promise<void> {
  await page.evaluate((on) => {
    const pictures = window.wkcTest?.bridge.pictures;
    if (pictures === undefined) throw new Error('No test hook.');
    if (!Reflect.has(window, 'wkcBreakSaves')) {
      const save = pictures.save.bind(pictures);
      pictures.save = (profileId, input) =>
        Reflect.get(window, 'wkcBreakSaves') === true
          ? Promise.reject(new Error('The disk is full.'))
          : save(profileId, input);
    }
    Reflect.set(window, 'wkcBreakSaves', on);
  }, broken);
}

test.describe('when the picture cannot be saved', () => {
  test('the studio keeps the picture, says so, and saves it once saving works again', async () => {
    const page = await start();
    await breakSaves(page, true);
    await paintLine(page, 500, { lift: false });
    await button(page, strings.exit.text).click();

    // The child stays with the picture and hears and sees why.
    const problem = page.locator('.wk-paint-problem');
    await expect(problem).toHaveText(strings.pictureNotSaved.text);
    await expect
      .poll(async () => (await readAudioLog(page)).some((entry) => entry.name === strings.pictureNotSaved.id))
      .toBe(true);
    await expect(page.locator('.wk-paint-screen[data-ready="true"]')).toBeVisible();
    expect(await pixelOf(page, 600, 500)).toEqual(RED);

    await breakSaves(page, false);
    await button(page, strings.exit.text).click();
    await waitForHome(page);
    expect(await galleryIds(page)).toHaveLength(1);
  });
});
