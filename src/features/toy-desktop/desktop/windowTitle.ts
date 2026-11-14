import { t } from '../../../core/strings/defineStrings.ts';
import { getNode, HOME_ID, TRASH_ID } from '../model/fileSystem.ts';
import { hasUnsavedChanges, type DesktopState, type WindowState } from '../model/state.ts';
import { APP_NAMES } from './labels.ts';
import { strings } from './strings.ts';

/** What a window's title bar and task strip button say. */
export interface WindowTitle {
  /** The text shown. A file or folder name is the child's own words, so it is not a string. */
  readonly text: string;
  readonly unsaved: boolean;
}

/** A document window shows its file's name, a file explorer its folder, anything else its app. */
export function windowTitle(state: DesktopState, window: WindowState): WindowTitle {
  const { app } = window;
  const unsaved = hasUnsavedChanges(app);
  if (app.kind === 'file-explorer') {
    if (app.search.text.trim() !== '') return { text: t(strings.search), unsaved };
    if (app.folderId === HOME_ID) return { text: t(strings.home), unsaved };
    if (app.folderId === TRASH_ID) return { text: t(strings.trash), unsaved };
    return { text: getNode(state.fs, app.folderId)?.name ?? t(APP_NAMES[app.kind]), unsaved };
  }
  if ('fileId' in app) {
    const file = getNode(state.fs, app.fileId);
    if (file !== undefined) return { text: file.name, unsaved };
  }
  return { text: t(APP_NAMES[app.kind]), unsaved };
}
