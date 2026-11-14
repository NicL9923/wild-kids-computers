import { AxeBuilder } from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

/** The axe tags that together cover WCAG 2.0, 2.1, and 2.2 at levels A and AA. */
const WCAG_22_AA_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/**
 * Runs axe in the page and fails on any WCAG 2.2 AA violation.
 *
 * Legacy mode is required in Electron. The default mode opens a blank page to merge frame
 * results, and Electron answers that with "Target.createTarget: Not supported". Legacy mode
 * injects axe through Playwright's evaluate, which runs over the DevTools protocol and is not
 * subject to the page's content security policy. The same call works in the browser project.
 */
export async function expectAccessible(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).setLegacyMode(true).withTags(WCAG_22_AA_TAGS).analyze();
  const summary = results.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.map((node) => node.target.join(' ')),
  }));
  expect(summary, 'axe WCAG 2.2 AA violations').toEqual([]);
  // A scan that checked nothing would also report zero violations.
  expect(results.passes.length, 'axe ran no passing checks, so it did not scan the page').toBeGreaterThan(0);
}
