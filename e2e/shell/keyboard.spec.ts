import { expect, test } from '@playwright/test';
import { strings as firstLaunch } from '../../src/app/first-launch/strings.ts';
import { strings as homeStrings } from '../../src/app/home/strings.ts';
import { strings as cornerStrings } from '../../src/app/parent-corner/strings.ts';
import { strings as gateStrings } from '../../src/app/parent-gate/strings.ts';
import { strings as choiceStrings } from '../../src/app/profile-choice/strings.ts';
import { strings as profileStrings } from '../../src/app/profiles/strings.ts';
import { strings as shellStrings } from '../../src/app/shell/strings.ts';
import { launchApp, type LaunchedApp } from '../support/launchApp.ts';
import { expectFocused, expectVisibleFocus, tabTo } from '../support/keyboard.ts';
import { homeMap, parentCornerHeading, savedProfiles, waitForHome, wordGateAnswer } from './shellSupport.ts';

// The keyboard-only walk the contract asks for: first launch, the profile choice, the home map,
// and the parent corner, with no mouse at all. Area screens belong to the activity kit's walk.

let launched: LaunchedApp;

test.afterEach(async () => {
  await launched.close();
});

async function press(target: ReturnType<LaunchedApp['page']['getByRole']>, key = 'Enter'): Promise<void> {
  const { page } = launched;
  await tabTo(page, target);
  await expectVisibleFocus(page);
  await page.keyboard.press(key);
}

test('first launch, the home map, and the parent corner with the keyboard alone', async () => {
  launched = await launchApp();
  const { page } = launched;
  const heading = (text: string) => page.getByRole('heading', { level: 1, name: text });
  const next = page.getByRole('button', { name: firstLaunch.next.text });

  await expect(heading(firstLaunch.animalHeading.text)).toBeVisible({ timeout: 15_000 });
  // Each step starts at its question.
  await expectFocused(heading(firstLaunch.animalHeading.text));
  await tabTo(page, page.getByRole('radio', { name: profileStrings['avatar-fox'].text }));
  await expectVisibleFocus(page);
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('radio', { name: profileStrings['avatar-rabbit'].text })).toBeChecked();
  await press(next);

  await expect(heading(firstLaunch.colorHeading.text)).toBeVisible();
  await press(page.getByRole('radio', { name: profileStrings['color-sun'].text }), 'Space');
  await expect(page.getByRole('radio', { name: profileStrings['color-sun'].text })).toBeChecked();
  await tabTo(page, page.getByLabel(firstLaunch.nameLabel.text));
  await page.keyboard.type('Kai');
  await press(next);

  await expect(heading(firstLaunch.bandHeading.text)).toBeVisible();
  // Tab enters a radio group at its first choice; the arrow keys move the choice.
  await press(page.getByRole('radio', { name: new RegExp(profileStrings['band-band-3-5'].text) }), 'ArrowRight');
  await expect(page.getByRole('radio', { name: new RegExp(profileStrings['band-band-6-8'].text) })).toBeChecked();
  await press(next);

  await expect(heading(firstLaunch.soundHeading.text)).toBeVisible();
  await press(page.getByRole('button', { name: firstLaunch.playSound.text }));
  await press(next);

  await expect(heading(firstLaunch.kioskHeading.text)).toBeVisible();
  await press(page.getByRole('button', { name: firstLaunch.finish.text }));

  await waitForHome(page);
  // Every place on the map is reachable, and the top bar comes before the map.
  await tabTo(page, page.getByRole('button', { name: shellStrings.mute.text }));
  for (const place of ['place-paint-studio', 'place-early-learning', 'place-toy-desktop'] as const) {
    await tabTo(page, homeMap(page).getByRole('button', { name: homeStrings[place].text }), 1);
    await expectVisibleFocus(page);
  }

  await press(page.getByRole('button', { name: shellStrings.grownUps.text }));
  const answer = page.getByLabel(gateStrings.wordLabel.text);
  await expectFocused(answer);
  await page.keyboard.type(await wordGateAnswer(page));
  await page.keyboard.press('Enter');
  await expect(parentCornerHeading(page)).toBeVisible();

  const standard = page
    .getByRole('group', { name: cornerStrings.textSize.text })
    .getByRole('radio', { name: cornerStrings['text-size-standard'].text });
  await tabTo(page, standard, 80);
  await expectVisibleFocus(page);
  await page.keyboard.press('ArrowRight');
  await expect(
    page.getByRole('group', { name: cornerStrings.textSize.text }).getByRole('radio', {
      name: cornerStrings['text-size-large'].text,
      exact: true,
    }),
  ).toBeChecked();
  await tabTo(page, page.getByRole('button', { name: cornerStrings.back.text }), 80, 'Shift+Tab');
  await page.keyboard.press('Enter');
  await waitForHome(page);
  await expect(page.locator('html')).toHaveAttribute('data-text-size', 'large');
});

test('the profile choice with the keyboard alone', async () => {
  const fox = { id: 'fox-kid', avatarId: 'fox', colorId: 'sky', band: 'band-3-5' } as const;
  const owl = { id: 'owl-kid', avatarId: 'owl', colorId: 'fern', band: 'band-9-12', name: 'Ada' } as const;
  launched = await launchApp({ band: 'band-3-5' }, { documents: savedProfiles([fox, owl], fox.id) });
  const { page } = launched;
  await expect(page.getByRole('heading', { level: 1, name: choiceStrings.heading.text })).toBeVisible({
    timeout: 15_000,
  });
  await press(page.locator(`[data-profile="${owl.id}"]`));
  await waitForHome(page);
  await expect(page.locator('html')).toHaveAttribute('data-band', 'band-9-12');

  await press(page.getByRole('button', { name: homeStrings.changePlayer.text }));
  await expect(page.getByRole('heading', { level: 1, name: choiceStrings.heading.text })).toBeVisible();
});
