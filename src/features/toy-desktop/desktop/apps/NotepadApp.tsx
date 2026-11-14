import { t } from '../../../../core/strings/defineStrings.ts';
import type { NotepadState } from '../../model/state.ts';
import { strings } from '../strings.ts';
import { ToyTextField } from '../ToyTextField.tsx';

/** A page to type on. The text box is real; its text, caret, and undo live in the model. */
export function NotepadApp({ windowId, app }: { readonly windowId: string; readonly app: NotepadState }) {
  return (
    <div className='td-notepad' data-autofocus-within>
      <ToyTextField
        windowId={windowId}
        field='document'
        editor={app.editor}
        label={t(strings.noteText)}
        className='td-notepad-text'
      />
    </div>
  );
}
