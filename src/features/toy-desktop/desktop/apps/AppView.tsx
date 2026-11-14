import type { WindowState } from '../../model/state.ts';
import { CalculatorApp } from './CalculatorApp.tsx';
import { FileExplorerApp } from './FileExplorerApp.tsx';
import { MusicBoxApp } from './MusicBoxApp.tsx';
import { NotepadApp } from './NotepadApp.tsx';
import { PictureViewerApp } from './PictureViewerApp.tsx';
import { SettingsApp } from './SettingsApp.tsx';

/** The app inside a window. Each app renders its own model state and dispatches its actions. */
export function AppView({ window, focused }: { readonly window: WindowState; readonly focused: boolean }) {
  const { app } = window;
  switch (app.kind) {
    case 'notepad':
      return <NotepadApp windowId={window.id} app={app} />;
    case 'picture-viewer':
      return <PictureViewerApp windowId={window.id} app={app} />;
    case 'file-explorer':
      return <FileExplorerApp windowId={window.id} app={app} />;
    case 'music-box':
      return <MusicBoxApp windowId={window.id} app={app} />;
    case 'calculator':
      return <CalculatorApp windowId={window.id} app={app} focused={focused} />;
    default:
      return <SettingsApp windowId={window.id} app={app} />;
  }
}
