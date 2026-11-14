import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useActivityKeys } from '../../../../activityShell/activityKeys.ts';
import { toyClipboard } from '../../../../app/inputGuards.ts';
import type { ActivityKit, ActivityProps } from '../../../../activityShell/kit.ts';
import { useChildScope } from '../../../../activityShell/useScope.ts';
import { Button } from '../../../../components/ui/Button.tsx';
import type { OsFamily } from '../../../../core/platform/bridge.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { feedback } from '../../../../core/strings/shared/index.ts';
import { usePlatformOs } from '../../../toy-desktop/desktop/usePlatformOs.ts';
import { createEditor, type TextEditorState, type TextOpResult } from '../../../toy-desktop/model/textEditor.ts';
import { EditorField, type EditorFieldHandle } from '../../shared/EditorField.tsx';
import type { WorkshopLevel } from './level.ts';
import { SHORTCUT_TEXT, stepInstruction } from './speech.ts';
import { STEP_DONE_PAUSE_MS, type ShortcutId } from './steps.ts';
import { strings } from './strings.ts';
import './shortcutWorkshop.css';

function startEditor(step: WorkshopLevel): TextEditorState {
  const [anchor, caret] = step.selection;
  const undo = step.history.map((text) => ({ text, anchor: text.length, caret: text.length }));
  return { ...createEditor({ text: step.text, multiline: true }), anchor, caret, undo };
}

/** The keys of one shortcut, drawn as key caps: the modifier of this computer, then the letter. */
function ShortcutCaps({ shortcut, os }: { shortcut: ShortcutId; os: OsFamily }) {
  const text = SHORTCUT_TEXT[shortcut];
  return (
    <li className='sw-shortcut' data-shortcut={shortcut}>
      <span className='sw-shortcut-name'>{t(text.name)}</span>
      <span className='sw-caps'>
        <kbd className='sw-cap' data-cap='modifier'>
          {t(os === 'mac' ? strings.capCmd : strings.capCtrl)}
        </kbd>
        <span className='sw-plus' aria-hidden='true'>
          {t(strings.plusMark)}
        </span>
        <kbd className='sw-cap'>{text.key}</kbd>
      </span>
    </li>
  );
}

/**
 * One step in the note editor. The note is a real text box on the toy desktop's text model, so
 * the shortcuts work as on a real computer, with the modifier of the child's own computer. Copy,
 * cut, and paste use the app's toy clipboard, and save keeps the note inside the editor: it never
 * opens a dialog or writes a file.
 */
function WorkshopStepView({
  step,
  kit,
  os,
  onStartOver,
}: {
  step: WorkshopLevel;
  kit: ActivityKit;
  os: OsFamily;
  onStartOver: () => void;
}) {
  const [editor, setEditor] = useState(() => startEditor(step));
  const [savedText, setSavedText] = useState<string | null>(step.saved ? step.text : null);
  const [done, setDone] = useState(false);
  const latest = useRef({ editor, savedText, done });
  useLayoutEffect(() => {
    latest.current = { editor, savedText, done };
  });
  const note = useRef<HTMLDivElement>(null);
  const editorField = useRef<EditorFieldHandle>(null);
  // This attempt's own timers and subscriptions. Starting the step again unmounts the attempt,
  // which cancels its pause before the round ends, so it cannot finish the attempt after it.
  const attempt = useChildScope(kit);

  // A shortcut pressed while focus is elsewhere, such as on the replay control, still reaches the note.
  useActivityKeys(kit, (event) => editorField.current?.takeKey(event));

  function check(current: TextEditorState, saved: string | null): void {
    if (latest.current.done) return;
    const state = {
      text: current.text,
      anchor: current.anchor,
      caret: current.caret,
      clipboard: toyClipboard.read()?.text ?? null,
      saved: saved === current.text,
      undone: current.redo.length,
    };
    if (!step.done(state)) return;
    latest.current = { ...latest.current, done: true };
    setDone(true);
    kit.feedback.correct({ at: note.current ?? undefined, say: feedback.youDidIt });
    attempt.setTimeout(() => kit.roundComplete(), STEP_DONE_PAUSE_MS);
  }

  // Each step starts with its own clipboard, so an earlier copy cannot finish it.
  useLayoutEffect(() => {
    if (step.clipboard === null) toyClipboard.clear();
    else toyClipboard.write({ kind: 'text', text: step.clipboard });
  }, [step]);

  // A copy can also arrive from the app's clipboard guard, such as from the Edit menu on a Mac.
  useEffect(
    () => attempt.own(toyClipboard.subscribe(() => check(latest.current.editor, latest.current.savedText))),
    // The check reads the latest state through the ref.
    // oxlint-disable-next-line react/exhaustive-deps
    [attempt],
  );

  function onEdit(result: TextOpResult): void {
    if (latest.current.done) return;
    latest.current = { ...latest.current, editor: result.editor };
    setEditor(result.editor);
    check(result.editor, latest.current.savedText);
  }

  function onSave(): void {
    if (latest.current.done) return;
    const text = latest.current.editor.text;
    latest.current = { ...latest.current, savedText: text };
    setSavedText(text);
    kit.play('snap');
    check(latest.current.editor, text);
  }

  const saved = savedText === editor.text;
  const sayStartOver = () => void kit.speak(strings.startOver);

  return (
    <div className='sw-stage' data-step={step.id} data-done={done} data-saved={saved}>
      <div className='sw-window' ref={note}>
        <div className='sw-titlebar'>
          <span className='sw-title'>{t(strings.noteTitle)}</span>
          <span className='sw-status' data-saved={saved}>
            <svg className='sw-status-icon' viewBox='0 0 24 24' aria-hidden='true'>
              {saved ? <path d='M5 12.5 L10 17.5 L19 7' /> : <circle cx='12' cy='12' r='5' />}
            </svg>
            {t(saved ? strings.saved : strings.notSaved)}
          </span>
        </div>
        <EditorField
          className='sw-note'
          editor={editor}
          os={os}
          label={t(strings.note)}
          onEdit={onEdit}
          onSave={onSave}
          focusOnMount
          handle={editorField}
        />
      </div>
      <aside className='sw-panel' aria-label={t(strings.shortcuts)}>
        <ul className='sw-shortcuts'>
          {step.teach.map((shortcut) => (
            <ShortcutCaps key={shortcut} shortcut={shortcut} os={os} />
          ))}
        </ul>
        <Button onClick={onStartOver} onPointerEnter={sayStartOver} onFocus={sayStartOver}>
          {t(strings.startOver)}
        </Button>
      </aside>
    </div>
  );
}

export default function ShortcutWorkshopActivity({ level, kit }: ActivityProps<WorkshopLevel>) {
  const os = usePlatformOs();
  const [attempt, setAttempt] = useState(0);

  // What to do and how to press it on this computer, after the shell's own start of the step.
  useEffect(() => kit.scope.setTimeout(() => kit.setInstruction(stepInstruction(level, os)), 0), [kit, level, os]);

  return (
    <WorkshopStepView
      key={attempt}
      step={level}
      kit={kit}
      os={os}
      onStartOver={() => setAttempt((count) => count + 1)}
    />
  );
}
