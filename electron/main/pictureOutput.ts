import { randomBytes } from 'node:crypto';
import { access } from 'node:fs/promises';
import path from 'node:path';
import { BrowserWindow, dialog } from 'electron';
import { BridgeError, type ExportResult, type PrintResult } from '../../src/core/platform/bridge.ts';
import { isExportFileStem } from '../../src/core/platform/names.ts';
import { NO_PATH_CHECK, writeFileAtomic } from './atomicWrite.ts';
import { BUNDLE_SCHEME, PRINT_PATH_PREFIX, type PrintStore } from './bundleProtocol.ts';
import { checkOutputPng, exportTarget, printOutcome } from './outputChecks.ts';

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Shows the save dialog and writes the PNG where the adult chose. The dialog is the only source
 * of the path. The renderer supplies only a file name stem for the suggestion.
 */
export async function exportPicture(
  owner: BrowserWindow,
  png: Uint8Array,
  fileStem: string,
  picturesDir: string,
): Promise<ExportResult> {
  checkOutputPng(png);
  if (!isExportFileStem(fileStem)) throw new BridgeError('invalid-argument', 'The file name is not allowed.');
  if (owner.isDestroyed()) return 'cancelled';
  const result = await dialog.showSaveDialog(owner, {
    defaultPath: path.join(picturesDir, `${fileStem}.png`),
    filters: [{ name: 'PNG', extensions: ['png'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });
  if (result.canceled || result.filePath === undefined || result.filePath === '') return 'cancelled';
  const target = exportTarget(result.filePath);
  // On Linux/GTK, typing "fox" without ".png" checks overwrite against "fox", not "fox.png".
  if (target !== result.filePath && (await fileExists(target))) {
    if (owner.isDestroyed()) return 'cancelled';
    const confirm = await dialog.showMessageBox(owner, {
      type: 'question',
      buttons: ['Cancel', 'Replace'],
      defaultId: 0,
      cancelId: 0,
      title: 'Replace existing file?',
      message: `${path.basename(target)} already exists. Do you want to replace it?`,
    });
    if (confirm.response !== 1) return 'cancelled';
  }
  await writeFileAtomic(target, png, NO_PATH_CHECK);
  return 'saved';
}

const PRINT_PAGE = [
  '<!doctype html><meta charset="utf-8">',
  '<style>@page{margin:10mm}html,body{margin:0;height:100%}',
  'img{display:block;max-width:100%;max-height:100vh;margin:auto;object-fit:contain}</style>',
  '<img alt="" src="./picture.png">',
].join('');

/**
 * Prints a PNG through the system print dialog. A hidden, sandboxed window with no preload loads
 * the picture from a one-time app://bundle/__print/<token>/ URL under a script-blocking CSP,
 * avoiding data URLs and base64 memory spikes. Active print windows are tracked so closing the
 * main window destroys them instead of stranding the single-instance lock.
 */
export async function printPicture(
  owner: BrowserWindow,
  png: Uint8Array,
  printStore: PrintStore,
  activePrintWindows: Set<BrowserWindow>,
): Promise<PrintResult> {
  checkOutputPng(png);
  if (owner.isDestroyed()) return 'cancelled';
  const token = randomBytes(16).toString('hex');
  printStore.set(token, { html: PRINT_PAGE, png });
  const printWindow = new BrowserWindow({
    parent: owner,
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  activePrintWindows.add(printWindow);
  try {
    await printWindow.loadURL(`${BUNDLE_SCHEME}://bundle${PRINT_PATH_PREFIX}${token}/page.html`);
    if (printWindow.isDestroyed() || owner.isDestroyed()) return 'cancelled';
    return await new Promise<PrintResult>((resolve, reject) => {
      let settled = false;
      const finish = (outcome: PrintResult | BridgeError) => {
        if (settled) return;
        settled = true;
        if (outcome instanceof BridgeError) reject(outcome);
        else resolve(outcome);
      };
      printWindow.once('closed', () => finish('cancelled'));
      printWindow.webContents.once('render-process-gone', () =>
        finish(new BridgeError('io', 'Printing stopped unexpectedly.')),
      );
      printWindow.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
        finish(printOutcome(success, failureReason));
      });
    });
  } finally {
    printStore.delete(token);
    activePrintWindows.delete(printWindow);
    if (!printWindow.isDestroyed()) printWindow.destroy();
  }
}
