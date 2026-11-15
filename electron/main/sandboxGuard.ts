/**
 * Hard rule 8 says the sandbox stays on. Chromium turns it off for the whole app, or for the GPU
 * process that draws the pages, when it is started with one of these switches, and the app
 * cannot turn it back on once Chromium has started. The AppImage's own launcher adds --no-sandbox by itself when the system blocks the
 * user namespaces the sandbox needs, as Ubuntu 24.04 and later do for an AppImage. So the app
 * refuses to start instead, and tells the adult what to do.
 */
const SANDBOX_OFF_SWITCHES = [
  'no-sandbox',
  'disable-seccomp-filter-sandbox',
  // The GPU process without its sandbox, and GPU work moved into the unsandboxed browser process.
  'disable-gpu-sandbox',
  'in-process-gpu',
] as const;

/** The install section of the README. A unit test keeps it in step with package.json. */
export const INSTALL_HELP_URL = 'https://github.com/NicL9923/wild-kids-computers#install';

interface CommandLine {
  hasSwitch(name: string): boolean;
}

/** The first switch on the command line that turns the sandbox off, or null. */
export function sandboxOffSwitch(commandLine: CommandLine): string | null {
  return SANDBOX_OFF_SWITCHES.find((name) => commandLine.hasSwitch(name)) ?? null;
}

/**
 * What the adult sees. The main process has no string catalog, and this text is for an adult
 * installing the app, never for a child, so it is plain English here.
 */
export function sandboxRefusal(switchName: string): { title: string; message: string } {
  return {
    title: 'Wild Kids - Computers cannot start',
    message:
      `It was started with --${switchName}, which turns off the protection that keeps the app's ` +
      'pages away from the rest of the computer. Start it without that option.\n\n' +
      'On Ubuntu 24.04 and later, the AppImage cannot use that protection without a system ' +
      'setting, and its launcher adds the option on its own. Install the .deb package instead, ' +
      `which sets up the permission the protection needs.\n\nInstall help: ${INSTALL_HELP_URL}`,
  };
}
