import type { CommandLine } from 'electron';

/**
 * Chromium switches that keep the page from reaching the disk or a system dialog except through
 * the bridge. They must be appended before the ready event.
 *
 * FileSystemAccessLocal is the Blink feature behind showOpenFilePicker, showSaveFilePicker, and
 * showDirectoryPicker. Each opens a native file dialog, and a save picker can write a file the
 * parent gate never saw. With the feature off, the functions do not exist in the page.
 *
 * EyeDropperAPI is the screen-wide color picker behind `new EyeDropper().open()`. It reads
 * colors from anywhere on the screen, outside the app. A probe on Electron 45.3.2 saw its promise
 * stay pending from a click with nothing to answer it. With the feature off, EyeDropper does not
 * exist in the page.
 */
export function applyPageSwitches(commandLine: Pick<CommandLine, 'appendSwitch'>): void {
  commandLine.appendSwitch('disable-blink-features', 'FileSystemAccessLocal,EyeDropperAPI');
}
