import { expect, type Page } from '@playwright/test';
import { strings as homeStrings } from '../../src/app/home/strings.ts';
import { strings as cornerStrings } from '../../src/app/parent-corner/strings.ts';
import { strings as gateStrings } from '../../src/app/parent-gate/strings.ts';
import type { ParentGateReason } from '../../src/app/parent-gate/reasons.ts';
import { strings as shellStrings } from '../../src/app/shell/strings.ts';
import { documentNames, type DocumentName } from '../../src/core/platform/names.ts';
import { appDocument, settingsDocument, type Profile, type Settings } from '../../src/core/storage/schemas.ts';
import { settle } from '../support/screens.ts';

const DIGIT_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

const json = (value: unknown): string => JSON.stringify(value);

/** Saved documents for profiles that exist, first launch done, and `active` chosen last time. */
export function savedProfiles(
  profiles: readonly Profile[],
  active: string | null,
  settings: Partial<Settings> = {},
): Partial<Record<DocumentName, string>> {
  const documents: Partial<Record<DocumentName, string>> = {
    app: json({ ...appDocument.defaults(), firstLaunchDone: true, lastActiveProfileId: active }),
    profiles: json({ version: 1, profiles }),
  };
  for (const profile of profiles) {
    documents[documentNames.settings(profile.id)] = json({ ...settingsDocument.defaults(), ...settings });
  }
  return documents;
}

export const homeMap = (page: Page) => page.getByRole('navigation', { name: homeStrings.title.text });

export async function waitForHome(page: Page): Promise<void> {
  await expect(homeMap(page)).toBeVisible({ timeout: 15_000 });
  await settle(page);
}

export const gateDialog = (page: Page, reason: ParentGateReason) =>
  page.getByRole('dialog', { name: gateStrings[`title-${reason}`].text });

/** The digits the word gate shows, read the way an adult reads them. */
export async function wordGateAnswer(page: Page): Promise<string> {
  const text = (await page.getByTestId('gate-words').textContent()) ?? '';
  return text
    .trim()
    .split(/\s+/)
    .map((word) => String(DIGIT_WORDS.indexOf(word)))
    .join('');
}

/** Types into the open gate's word or PIN field and presses Continue. */
export async function answerGate(page: Page, answer: string, kind: 'word' | 'pin' = 'word'): Promise<void> {
  await page.getByLabel(kind === 'word' ? gateStrings.wordLabel.text : gateStrings.pinLabel.text).fill(answer);
  await page.getByRole('button', { name: gateStrings.continue.text }).click();
}

/** The grown-ups' control in the corner of the home map and the closing screen. */
export const grownUps = (page: Page) => page.getByRole('button', { name: shellStrings.grownUps.text, exact: true });

export const parentCornerHeading = (page: Page) =>
  page.getByRole('heading', { level: 1, name: cornerStrings.title.text });

/** Opens the parent corner from the home map and passes the word gate. */
export async function openParentCorner(page: Page): Promise<void> {
  await grownUps(page).click();
  await expect(gateDialog(page, 'parent-corner')).toBeVisible();
  await answerGate(page, await wordGateAnswer(page));
  await expect(parentCornerHeading(page)).toBeVisible();
  await settle(page);
}

/**
 * The smallest font size of any visible text on the page, in CSS px. Adult screens keep body
 * text at 16 px or more.
 */
export function smallestVisibleText(page: Page): Promise<{ size: number; text: string }> {
  return page.evaluate(() => {
    let smallest = { size: Number.POSITIVE_INFINITY, text: '' };
    for (const element of document.querySelectorAll<HTMLElement>('body *')) {
      const own = [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim());
      if (!own || element.closest('[hidden], .wk-visually-hidden') !== null || element.getClientRects().length === 0)
        continue;
      const size = Number.parseFloat(getComputedStyle(element).fontSize);
      if (size < smallest.size) smallest = { size, text: element.textContent?.trim().slice(0, 40) ?? '' };
    }
    return smallest;
  });
}
