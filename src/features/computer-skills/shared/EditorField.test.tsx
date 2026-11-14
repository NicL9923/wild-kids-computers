// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installInputGuards, toyClipboard } from '../../../app/inputGuards.ts';
import type { OsFamily } from '../../../core/platform/bridge.ts';
import { createEditor, type TextEditorState } from '../../toy-desktop/model/textEditor.ts';
import { EditorField, type EditorFieldHandle } from './EditorField.tsx';

afterEach(() => {
  cleanup();
  toyClipboard.clear();
});

function Harness({ start, os = 'linux', onSave }: { start: TextEditorState; os?: OsFamily; onSave?: () => void }) {
  const [editor, setEditor] = useState(start);
  const handle = useRef<EditorFieldHandle>(null);
  return (
    <>
      <button type='button' onKeyDown={(event) => handle.current?.takeKey(event.nativeEvent)}>
        replay
      </button>
      <EditorField
        editor={editor}
        os={os}
        label='note'
        onEdit={(result) => setEditor(result.editor)}
        {...(onSave === undefined ? {} : { onSave })}
        focusOnMount
        handle={handle}
      />
      <output data-testid='model'>{`${editor.text}|${String(editor.anchor)}-${String(editor.caret)}`}</output>
    </>
  );
}

const model = () => screen.getByTestId('model').textContent;
const field = () => screen.getByLabelText<HTMLInputElement>('note');

describe('EditorField', () => {
  it('types, moves with the arrows, and deletes through the text model', () => {
    render(<Harness start={createEditor({ text: 'cat' })} />);
    fireEvent.keyDown(field(), { key: 's' });
    expect(model()).toBe('cats|4-4');
    fireEvent.keyDown(field(), { key: 'ArrowLeft' });
    fireEvent.keyDown(field(), { key: 'ArrowLeft' });
    fireEvent.keyDown(field(), { key: 'Backspace' });
    expect(model()).toBe('cts|1-1');
    fireEvent.keyDown(field(), { key: 'Delete' });
    expect(model()).toBe('cs|1-1');
    expect(field().value).toBe('cs');
  });

  it('selects with Shift and the arrows, and the box shows the same selection', () => {
    render(<Harness start={createEditor({ text: 'red hat' })} />);
    for (let index = 0; index < 3; index++) fireEvent.keyDown(field(), { key: 'ArrowLeft', shiftKey: true });
    expect(model()).toBe('red hat|7-4');
    expect([field().selectionStart, field().selectionEnd]).toEqual([4, 7]);
  });

  it('copies and pastes with the toy clipboard, and undoes', () => {
    render(<Harness start={createEditor({ text: 'sun' })} />);
    fireEvent.keyDown(field(), { key: 'a', ctrlKey: true });
    fireEvent.keyDown(field(), { key: 'c', ctrlKey: true });
    expect(toyClipboard.read()).toEqual({ kind: 'text', text: 'sun' });
    fireEvent.keyDown(field(), { key: 'End' });
    fireEvent.keyDown(field(), { key: 'v', ctrlKey: true });
    expect(model()).toBe('sunsun|6-6');
    fireEvent.keyDown(field(), { key: 'z', ctrlKey: true });
    expect(model()).toBe('sun|3-3');
  });

  it('runs save for the save shortcut of this computer only', () => {
    const onSave = vi.fn<() => void>();
    render(<Harness start={createEditor({ text: 'sun' })} os='mac' onSave={onSave} />);
    fireEvent.keyDown(field(), { key: 's', ctrlKey: true });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.keyDown(field(), { key: 's', metaKey: true });
    expect(onSave).toHaveBeenCalledOnce();
    expect(model()).toBe('sun|3-3');
  });

  it('takes a selection made with the pointer into the model', () => {
    render(<Harness start={createEditor({ text: 'big dog' })} />);
    field().setSelectionRange(0, 3);
    fireEvent.select(field());
    expect(model()).toBe('big dog|0-3');
  });

  it('replays a paste the clipboard guard made, so the model keeps the same text', () => {
    const remove = installInputGuards(document);
    try {
      render(<Harness start={createEditor({ text: 'ab' })} />);
      toyClipboard.write({ kind: 'text', text: 'XY' });
      field().setSelectionRange(1, 1);
      fireEvent.select(field());
      fireEvent.paste(field());
      expect(model()).toBe('aXYb|3-3');
    } finally {
      remove();
    }
  });

  it('takes a key pressed while focus was elsewhere, runs it, and takes focus', () => {
    render(<Harness start={createEditor({ text: 'cats' })} />);
    const replay = screen.getByRole('button', { name: 'replay' });
    replay.focus();
    fireEvent.keyDown(replay, { key: 'Backspace' });
    expect(model()).toBe('cat|3-3');
    expect(document.activeElement).toBe(field());
    // A key the editor leaves alone does not move focus.
    replay.focus();
    fireEvent.keyDown(replay, { key: 'F2' });
    expect(document.activeElement).toBe(replay);
  });
});
