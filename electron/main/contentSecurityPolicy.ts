/**
 * The renderer's content security policy, from docs/architecture.md. The app:// handler sends
 * it as a header. vite.config.ts writes it into the production index.html as a <meta> tag so
 * the browser build has it too. The dev server carries neither, because Vite injects inline
 * scripts for hot reload.
 *
 * Inline styles are allowed because Radix adds <style> tags for scroll locking.
 */
const CONTENT_SECURITY_POLICY_DIRECTIVES: ReadonlyArray<readonly [string, string]> = [
  ['default-src', "'none'"],
  ['script-src', "'self'"],
  ['style-src', "'self' 'unsafe-inline'"],
  ['img-src', "'self' blob: data:"],
  ['media-src', "'self' blob:"],
  ['font-src', "'self'"],
  ['connect-src', "'self'"],
  ['worker-src', "'self' blob:"],
  ['base-uri', "'none'"],
  ['form-action', "'none'"],
  ['frame-ancestors', "'none'"],
  // The page keeps scripts, its own origin, and form events, and loses everything else a
  // sandbox can take away. Without allow-downloads no link or navigation can start a download,
  // and without allow-modals window.print() and alert() open nothing. Pictures leave the app only
  // through the bridge's export and print.
  ['sandbox', 'allow-scripts allow-same-origin allow-forms'],
];

// Browsers ignore these in a <meta> policy and log a warning, so the tag leaves them out.
const HEADER_ONLY_DIRECTIVES = new Set(['frame-ancestors', 'sandbox']);

function serialize(directives: ReadonlyArray<readonly [string, string]>): string {
  return directives.map(([name, value]) => `${name} ${value}`).join('; ');
}

export const CONTENT_SECURITY_POLICY = serialize(CONTENT_SECURITY_POLICY_DIRECTIVES);

export const CONTENT_SECURITY_POLICY_META = serialize(
  CONTENT_SECURITY_POLICY_DIRECTIVES.filter(([name]) => !HEADER_ONLY_DIRECTIVES.has(name)),
);
