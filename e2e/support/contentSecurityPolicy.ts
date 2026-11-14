import type { Page } from '@playwright/test';

/**
 * Adds an inline <script> to the page and reports whether it ran and which directive blocked it.
 * Under the app's policy the expected result is `{ ran: false, blockedBy: 'script-src-elem' }`.
 */
export async function tryInlineScript(page: Page): Promise<{ ran: boolean; blockedBy: string | null }> {
  return page.evaluate(async () => {
    const violation = new Promise<string | null>((resolve) => {
      document.addEventListener('securitypolicyviolation', (event) => resolve(event.effectiveDirective), {
        once: true,
      });
      // No violation event arrives when the policy allows the script.
      window.setTimeout(() => resolve(null), 2_000);
    });
    const script = document.createElement('script');
    script.textContent = 'window.wkcInlineRan = true;';
    document.head.append(script);
    const blockedBy = await violation;
    return { ran: Reflect.get(window, 'wkcInlineRan') === true, blockedBy };
  });
}
