import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useActivityKeys } from '../../../../activityShell/activityKeys.ts';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { usePlatformOs } from '../../../toy-desktop/desktop/usePlatformOs.ts';
import { createEditor, type TextEditorState, type TextOpResult } from '../../../toy-desktop/model/textEditor.ts';
import { EditorField, type EditorFieldHandle } from '../../shared/EditorField.tsx';
import './fixTheSentence.css';
import { differingRange, editDistance, FIXED_PAUSE_MS, type FixLevel } from './level.ts';
import { strings } from './strings.ts';
import { CAP_KEYS, capLabel, SENTENCE_SPEECH, tipFor } from './tips.ts';

/** Changes that move the text away from the sentence before the slip is marked and the tip said. */
const WRONG_BEFORE_HELP = 2;
/** How long a pressed key stays lit in the row of key caps. */
const PRESSED_MS = 300;

function startEditor(level: FixLevel): TextEditorState {
  return { ...createEditor({ text: level.start }), anchor: level.caret, caret: level.caret };
}

/**
 * The sentence as it should be, in a card the child can listen to, and below it the sentence
 * with one small slip in a real text field. Typing, Backspace, Delete, the arrows, Shift
 * selection, and undo all work as on a real computer. A change that takes the text further from
 * the sentence gets a quiet nudge and can be undone; after two, the slip is marked.
 *
 * Several edits can land before React draws, so the edit handler reads and writes the text, the
 * wrong count, and whether the sentence is fixed in live records, never the values of the last
 * render.
 */
export default function FixTheSentenceActivity({ level, kit }: ActivityProps<FixLevel>) {
  const os = usePlatformOs();
  const [editor, setEditor] = useState(() => startEditor(level));
  const [wrong, setWrong] = useState(0);
  const [fixed, setFixed] = useState(false);
  const [pressed, setPressed] = useState<string | null>(null);
  const field = useRef<HTMLDivElement>(null);
  const backdrop = useRef<HTMLDivElement>(null);
  const text = useRef(level.start);
  const live = useRef({ wrong, fixed });
  const editorField = useRef<EditorFieldHandle>(null);
  const sentence = SENTENCE_SPEECH[level.sentence];
  const tip = tipFor(level, os);

  // The sentence and the tip, after the shell's own start of the round.
  useEffect(
    () => kit.scope.setTimeout(() => kit.setInstruction([strings.itSays, sentence, tip]), 0),
    [kit, sentence, tip],
  );

  // A key pressed while focus is elsewhere, such as on the replay control, still edits the text.
  useActivityKeys(kit, (event) => editorField.current?.takeKey(event));

  // Lights the key cap of each key the child presses, wherever focus is.
  useEffect(
    () =>
      kit.scope.listen(window, 'keydown', (event: KeyboardEvent) => {
        const key = event.key;
        if (!Object.values(CAP_KEYS).includes(key)) return;
        setPressed(key);
        kit.scope.setTimeout(() => setPressed((current) => (current === key ? null : current)), PRESSED_MS);
      }),
    [kit],
  );

  // The mark sits on a copy of the text behind the field, so it scrolls with the field's text.
  useLayoutEffect(() => {
    const input = field.current?.querySelector('input');
    if (input == null) return undefined;
    const follow = () => {
      if (backdrop.current !== null) backdrop.current.scrollLeft = input.scrollLeft;
    };
    follow();
    return kit.scope.listen(input, 'scroll', follow);
  });

  function onEdit(result: TextOpResult): void {
    if (live.current.fixed) return;
    setEditor(result.editor);
    if (!result.changed) return;
    const before = text.current;
    const after = result.editor.text;
    text.current = after;
    if (after === level.target) {
      live.current = { ...live.current, fixed: true };
      setFixed(true);
      kit.feedback.correct({ at: field.current ?? undefined, say: strings.fixed });
      kit.scope.setTimeout(() => kit.roundComplete(), FIXED_PAUSE_MS);
      return;
    }
    if (editDistance(after, level.target) <= editDistance(before, level.target)) return;
    const count = live.current.wrong + 1;
    live.current = { ...live.current, wrong: count };
    setWrong(count);
    kit.feedback.wrong({ at: field.current ?? undefined });
    if (count === WRONG_BEFORE_HELP) kit.hint(level.marked ? tip : strings.showMark);
  }

  const range = fixed ? null : differingRange(editor.text, level.target);
  const marked = range !== null && (level.marked || wrong >= WRONG_BEFORE_HELP);
  const say = () => void kit.speak(sentence);

  return (
    <div className='fix-stage' data-fixed={fixed} data-marked={marked}>
      <div className='fix-column'>
        <button type='button' className='fix-target' onClick={say} onPointerEnter={say} onFocus={say}>
          <span className='fix-target-label'>{t(strings.shouldSay)}</span>
          <span className='fix-target-text'>{t(sentence)}</span>
        </button>
        <div className='fix-field' ref={field}>
          <div className='fix-backdrop' aria-hidden='true' ref={backdrop}>
            {marked ? (
              <>
                {editor.text.slice(0, range.start)}
                <mark className='fix-mark' data-gap={range.start === range.end}>
                  {editor.text.slice(range.start, range.end)}
                </mark>
                {editor.text.slice(range.end)}
              </>
            ) : (
              editor.text
            )}
          </div>
          <EditorField
            className='fix-input'
            editor={editor}
            os={os}
            label={t(strings.box)}
            onEdit={onEdit}
            focusOnMount
            handle={editorField}
          />
        </div>
        <ul className='fix-keys' aria-label={t(strings.keys)}>
          {level.keys.map((key) => (
            <li key={key} className='fix-cap' data-cap={key} data-pressed={pressed === CAP_KEYS[key]}>
              {t(capLabel(key, os))}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
