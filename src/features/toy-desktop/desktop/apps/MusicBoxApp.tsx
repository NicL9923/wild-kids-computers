import { useEffect } from 'react';
import { toyClipboard } from '../../../../app/inputGuards.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { numberHandle } from '../../../../core/strings/shared/index.ts';
import { TUNE_NOTES, TUNE_STEPS } from '../../model/apps/tune.ts';
import { isCommandEnabled } from '../../model/menus.ts';
import type { MusicBoxState } from '../../model/state.ts';
import { useDesktopContext } from '../desktopContext.ts';
import { ControlGlyph } from '../glyphs.tsx';
import { NOTE_ROW_NAMES } from '../labels.ts';
import { isHighlighted } from '../parts.ts';
import { strings } from '../strings.ts';

/** Time between steps while a tune plays. Slow enough to follow each note. */
export const MUSIC_BEAT_MS = 360;

const STEPS = Array.from({ length: TUNE_STEPS }, (_, step) => step);
/** Rows top to bottom: the highest note on top, as on a page of music. */
const ROWS = Array.from({ length: TUNE_NOTES }, (_, row) => TUNE_NOTES - 1 - row);

/**
 * A grid of notes. Each cell turns a note on or off at one step. Play walks through the steps
 * on a steady beat from the activity's scope and sounds each step's notes.
 */
export function MusicBoxApp({ windowId, app }: { readonly windowId: string; readonly app: MusicBoxState }) {
  const { desktop, kit, sayName, highlight } = useDesktopContext();
  const { state, dispatch } = desktop;

  useEffect(() => {
    if (!app.playing) return undefined;
    return kit.scope.setInterval(
      () => dispatch({ type: 'music-box', windowId, action: { type: 'tick' } }),
      MUSIC_BEAT_MS,
    );
  }, [app.playing, dispatch, kit.scope, windowId]);

  const playCommand = app.playing ? 'stop' : 'play';
  return (
    <div className='td-music'>
      <div className='td-toolbar'>
        <button
          type='button'
          className='td-tool td-tool-text'
          data-music-command={playCommand}
          data-highlight={isHighlighted(highlight, { kind: 'command', command: playCommand })}
          aria-pressed={app.playing}
          {...sayName(app.playing ? strings.stop : strings.play)}
          onClick={() => dispatch({ type: 'command', windowId, command: playCommand })}
        >
          <ControlGlyph glyph={app.playing ? 'stop' : 'play'} />
          {t(app.playing ? strings.stop : strings.play)}
        </button>
        <button
          type='button'
          className='td-tool td-tool-text'
          data-music-command='clear'
          disabled={!isCommandEnabled(state, windowId, 'clear', toyClipboard)}
          {...sayName(strings.clear)}
          onClick={() => dispatch({ type: 'command', windowId, command: 'clear' })}
        >
          {t(strings.clear)}
        </button>
      </div>
      <fieldset className='td-music-grid'>
        <legend className='wk-visually-hidden'>{t(strings.musicGrid)}</legend>
        {STEPS.map((step) => (
          <span key={step} id={`${windowId}-step-${String(step)}`} hidden>
            {t(numberHandle(step + 1))}
          </span>
        ))}
        {ROWS.map((note) => (
          <div key={note} className='td-music-row' data-note-row={note}>
            <span id={`${windowId}-note-${String(note)}`} hidden>
              {t(NOTE_ROW_NAMES[note] ?? strings.noteMiddle)}
            </span>
            {STEPS.map((step) => {
              const on = app.tune.steps[step]?.[note] ?? false;
              return (
                <button
                  key={step}
                  type='button'
                  className='td-music-cell'
                  data-step={step}
                  data-note={note}
                  data-now={app.playing && app.position === step}
                  aria-pressed={on}
                  aria-labelledby={`${windowId}-note-${String(note)} ${windowId}-step-${String(step)}`}
                  onClick={() => dispatch({ type: 'music-box', windowId, action: { type: 'toggle', step, note } })}
                >
                  <span className='td-music-dot' aria-hidden='true' />
                </button>
              );
            })}
          </div>
        ))}
      </fieldset>
    </div>
  );
}
