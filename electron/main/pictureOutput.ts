import path from 'node:path';
import { BrowserWindow, dialog } from 'electron';
import { BridgeError, type ExportResult, type PrintResult } from '../../src/core/platform/bridge.ts';
import { isExportFileStem } from '../../src/core/platform/names.ts';
import { writeFileAtomic } from './atomicWrite.ts';
import { checkOutputPng, exportTarget, printOutcome } from './outputChecks.ts';

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
  const result = await dialog.showSaveDialog(owner, {
    defaultPath: path.join(picturesDir, `${fileStem}.png`),
    filters: [{ name: 'PNG', extensions: ['png'] }],
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });
  if (result.canceled || result.filePath === undefined || result.filePath === '') return 'cancelled';
  await writeFileAtomic(exportTarget(result.filePath), png);
  return 'saved';
}

const PRINT_PAGE = [
  '<!doctype html><meta charset="utf-8">',
  '<style>@page{margin:10mm}html,body{margin:0;height:100%}',
  'img{display:block;max-width:100%;max-height:100vh;margin:auto;object-fit:contain}</style>',
  '<img alt="">',
].join('');

/**
 * Prints a PNG through the system print dialog. A hidden, sandboxed window with no preload
 * holds the picture. The bytes arrive as a blob URL because a data URL that large is over
 * Chromium's URL length cap.
 */
export async function printPicture(png: Uint8Array): Promise<PrintResult> {
  checkOutputPng(png);
  const printWindow = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: true },
  });
  try {
    await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(PRINT_PAGE)}`);
    const base64 = Buffer.from(png).toString('base64');
    await printWindow.webContents.executeJavaScript(
      `(async () => {
        const bytes = Uint8Array.from(atob(${JSON.stringify(base64)}), (c) => c.charCodeAt(0));
        const img = document.querySelector('img');
        img.src = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
        await img.decode();
      })()`,
    );
    return await new Promise<PrintResult>((resolve, reject) => {
      printWindow.webContents.print({ silent: false, printBackground: true }, (success, failureReason) => {
        const outcome = printOutcome(success, failureReason);
        if (outcome instanceof BridgeError) reject(outcome);
        else resolve(outcome);
      });
    });
  } finally {
    printWindow.destroy();
  }
}
