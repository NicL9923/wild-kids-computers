import { expect, test } from '@playwright/test';
import { strings } from '../../src/app/closing/strings.ts';
import { strings as homeStrings } from '../../src/app/home/strings.ts';
import { BANDS } from '../../src/core/bands.ts';
import { expectAccessible } from '../support/accessibility.ts';
import { readAudioLog } from '../support/audioLog.ts';
import { advanceClock } from '../support/clock.ts';
import { FIXTURE_PROFILE, launchApp, type LaunchedApp } from '../support/launchApp.ts';
import { resizeWindow, saveScreen, WINDOW_SIZES } from '../support/screens.ts';
import { answerGate, gateDialog, grownUps, savedProfiles, waitForHome, wordGateAnswer } from './shellSupport.ts';

let launched: LaunchedApp;

test.afterEach(async () => {
  await launched.close();
});

const TWENTY_MINUTES = 20 * 60_000;
const closingHeading = () => launched.page.getByRole('heading', { level: 1, name: strings.heading.text });

for (const band of BANDS) {
  test(`at ${band}, the closing screen replaces the next screen once the session length is used up`, async () => {
    const profile = { ...FIXTURE_PROFILE, band };
    launched = await launchApp(
      { band },
      { documents: savedProfiles([profile], profile.id, { sessionLengthMinutes: 20 }) },
    );
    const { page } = launched;
    await waitForHome(page);
    await advanceClock(page, TWENTY_MINUTES);
    await page.getByRole('button', { name: homeStrings['place-paint-studio'].text }).click();
    await expect(closingHeading()).toBeVisible();
    const spoken = (await readAudioLog(page)).map((entry) => entry.name);
    expect(spoken).toContain(strings.heading.id);
    // One control, for grown-ups. No clock, no count, no way out for the child.
    await expect(page.getByRole('button')).toHaveCount(1);
    await expectAccessible(page);
    for (const size of WINDOW_SIZES) {
      await resizeWindow(launched, size);
      await saveScreen(page, band, 'shell-closing');
    }

    await page.goBack();
    await expect(closingHeading()).toBeVisible();

    await grownUps(page).click();
    await answerGate(page, await wordGateAnswer(page));
    await expect(gateDialog(page, 'closing')).toBeHidden();
    await expectAccessible(page);
    await saveScreen(page, band, 'shell-closing-choices');
    await page.getByRole('button', { name: strings.moreTime.text }).click();
    await waitForHome(page);
  });
}
