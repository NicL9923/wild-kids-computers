import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import type { ActivityKit } from '../../../activityShell/kit.ts';
import { Emoji } from '../../../components/ui/Emoji.tsx';
import type { Band } from '../../../core/bands.ts';
import { t, type SpokenHandle } from '../../../core/strings/defineStrings.ts';
import { feedback } from '../../../core/strings/shared/index.ts';
import { openPaintStudioWith } from '../../paint-studio/startingPicture.ts';
import { hintSpeech } from '../blocks/speech.ts';
import { toPaintPicture } from '../engine/drawing.ts';
import type { FreeMode } from '../engine/freeMode.ts';
import type { RunResult } from '../engine/interpreter.ts';
import { MOVE_DIRECTIONS, PEN_COLORS, type BlockDraft, type Program } from '../engine/program.ts';
import { checkRun, DIRECT_PRESS_LIMIT, type Hint, type Puzzle } from '../engine/puzzle.ts';
import { validateProgram } from '../engine/validate.ts';
import { clearProgram, commit, startEditor, undo, type EditorState } from '../editor/editorState.ts';
import { ProgramEditor } from '../editor/ProgramEditor.tsx';
import { appendBlock, EMPTY_PROGRAM, MAIN, removeBlock, type EditRefusal } from '../editor/programEdit.ts';
import { RobotStage } from '../stage/RobotStage.tsx';
import { useRobotRun } from '../stage/useRobotRun.ts';
import { strings } from '../strings.ts';
import { RESULT_PAUSE_MS, VISUAL_HINT_AFTER } from '../timing.ts';
import {
  ArrowPad,
  ColorChoices,
  ControlButton,
  GoPicture,
  NextPicture,
  PlanStrip,
  StartOverPicture,
  StayPicture,
  StepPicture,
  ToStartPicture,
  UndoPicture,
} from './parts.tsx';
import './robotPainter.css';

/**
 * The robot painter screen for a puzzle or for free play. Three layouts:
 *
 * - `direct`: arrows that move the robot at once. The first tier 1 puzzles, and free play for the
 *   youngest children.
 * - `plan`: the youngest children's plan of a few arrows, a row of places, and go.
 * - `editor`: a toolbox, a program with repeats and defined blocks, and the run controls.
 */

type RobotMode =
  | { readonly kind: 'puzzle'; readonly puzzle: Puzzle }
  | { readonly kind: 'free'; readonly free: FreeMode };

type Layout = 'direct' | 'plan' | 'editor';

function layoutOf(mode: RobotMode, band: Band): Layout {
  const direct = mode.kind === 'puzzle' ? mode.puzzle.kind === 'direct' : mode.free.style === 'direct';
  if (direct) return 'direct';
  return band === 'band-3-5' ? 'plan' : 'editor';
}

function instructionOf(mode: RobotMode, layout: Layout): SpokenHandle {
  if (mode.kind === 'free') return layout === 'direct' ? strings.doFreeDirect : strings.doFreeBuild;
  const { puzzle } = mode;
  if (layout === 'direct') return strings.doDirect;
  if (puzzle.kind === 'fix') return strings.doFix;
  if (layout === 'plan') return strings.doPlan;
  if (puzzle.solution.definitions.length > 0) return strings.doDefine;
  return strings.doBuild;
}

/** Validates the program the screen holds. Edits keep it valid, so this only guards. */
function checked(program: Program) {
  const result = validateProgram(program);
  return result.ok ? result.program : null;
}

export interface RobotPainterProps {
  readonly mode: RobotMode;
  readonly band: Band;
  readonly kit: ActivityKit;
}

export function RobotPainter({ mode, band, kit }: RobotPainterProps) {
  const puzzle = mode.kind === 'puzzle' ? mode.puzzle : null;
  const world = puzzle?.world ?? (mode.kind === 'free' ? mode.free.world : null);
  if (world === null) throw new Error('A robot painter screen needs a puzzle or a free mode.');
  const toolbox = puzzle?.toolbox ?? (mode.kind === 'free' ? mode.free.toolbox : []);
  const limit = puzzle?.blockLimit ?? (mode.kind === 'free' ? mode.free.blockLimit : 0);
  const layout = layoutOf(mode, band);

  const navigate = useNavigate();
  const runner = useRobotRun(kit, world, band);
  const [editor, setEditor] = useState<EditorState>(() => startEditor(puzzle?.startingProgram ?? EMPTY_PROGRAM));
  const [solved, setSolved] = useState(false);
  const [visualHints, setVisualHints] = useState<readonly Hint[] | null>(null);
  const failures = useRef(0);
  const cancelResult = useRef<(() => void) | null>(null);
  const paper = useRef<HTMLElement | null>(null);
  const choices = useRef<HTMLDivElement | null>(null);

  // Each puzzle kind has its own instruction. The shell speaks the main one when the step
  // starts, in an effect that runs after this one, so this waits for it to finish.
  const instruction = instructionOf(mode, layout);
  useEffect(() => {
    queueMicrotask(() => {
      if (!kit.scope.disposed) kit.setInstruction(instruction);
    });
  }, [instruction, kit]);

  useEffect(() => {
    if (solved) choices.current?.focus();
  }, [solved]);

  const directions = MOVE_DIRECTIONS.filter((direction) =>
    toolbox.some((item) => item.kind === 'move' && item.direction === direction),
  );
  const penColors = PEN_COLORS.filter((color) => toolbox.some((item) => item.kind === 'color' && item.color === color));
  const running = runner.status === 'running';

  // Free play ends at the parent's session length only at a calm moment: after a direct move or a
  // finished program, never part way through a run, even one paused by "one step".
  const free = puzzle === null;
  const midRun = runner.status === 'running' || runner.status === 'paused';
  useEffect(() => (free && midRun ? kit.holdCheckpoint() : undefined), [free, midRun, kit]);

  const stopResultPause = () => {
    cancelResult.current?.();
    cancelResult.current = null;
  };

  const refused = (reason: EditRefusal) => {
    if (reason === 'full') void kit.speak(strings.boardFull);
    else kit.play('nudge');
  };

  const markSolved = () => {
    setSolved(true);
    // The next picture opens now, whether the child goes on or stays here and leaves later.
    if (puzzle !== null) kit.stepSolved();
    kit.feedback.correct(paper.current === null ? {} : { at: paper.current });
    void kit.speakSequence([feedback.youDidIt, strings.choose]);
  };

  const ended = (result: RunResult) => {
    if (puzzle === null) {
      // The run's hold lets go when the screen shows it ended; the check waits for that.
      kit.checkpoint();
      return;
    }
    const check = checkRun(puzzle, result);
    if (check.solved) {
      markSolved();
      return;
    }
    failures.current += 1;
    const first = check.hints[0];
    if (first !== undefined) kit.hint(hintSpeech(first));
    if (failures.current >= VISUAL_HINT_AFTER) setVisualHints(check.hints);
    // The child sees where the robot ended, then it goes back to the start. The program stays.
    cancelResult.current = kit.scope.setTimeout(() => {
      cancelResult.current = null;
      runner.reset();
    }, RESULT_PAUSE_MS);
  };

  const go = () => {
    if (solved || running) return;
    stopResultPause();
    const program = checked(editor.program);
    if (program === null) return;
    if (runner.status === 'ended') runner.reset();
    setVisualHints(null);
    runner.run(program, ended);
  };

  const stepOnce = () => {
    if (solved || running) return;
    stopResultPause();
    const program = checked(editor.program);
    if (program === null) return;
    if (runner.status === 'ended') runner.reset();
    setVisualHints(null);
    runner.stepOnce(program, ended);
  };

  const robotToStart = () => {
    stopResultPause();
    runner.reset();
  };

  /** Any change to the program. A run part way through starts again from the start. */
  const edit = (next: EditorState) => {
    setEditor(next);
    if (next.program === editor.program) return;
    setVisualHints(null);
    stopResultPause();
    if (runner.status === 'paused' || (puzzle !== null && runner.status !== 'idle')) runner.reset();
  };

  /** An arrow or a color that runs at once. */
  const press = (draft: BlockDraft) => {
    if (solved) return;
    stopResultPause();
    // A child who wandered far on a direct puzzle starts over, so the press log stays small.
    const base = puzzle !== null && editor.program.blocks.length >= DIRECT_PRESS_LIMIT ? EMPTY_PROGRAM : editor.program;
    const result = appendBlock(base, MAIN, draft, limit);
    if (!result.ok) {
      refused(result.reason);
      return;
    }
    setEditor(commit(editor, result).state);
    const program = checked(result.program);
    if (program === null) return;
    kit.play('tap');
    const run = runner.show(program);
    if (puzzle === null) kit.checkpoint();
    else if (checkRun(puzzle, run).solved) markSolved();
  };

  /** The youngest children's plan: an arrow goes into the next place. */
  const plan = (draft: BlockDraft) => {
    if (solved || running) return;
    const result = appendBlock(editor.program, MAIN, draft, limit);
    if (!result.ok) {
      refused(result.reason);
      return;
    }
    kit.play('snap');
    edit(commit(editor, result).state);
  };

  const paintIt = () => {
    const drawing = runner.view.drawing;
    if (drawing.length === 0) {
      void kit.speak(strings.hintNothingDrawn);
      return;
    }
    void navigate({ to: openPaintStudioWith({ kind: 'lines', ...toPaintPicture(drawing, world.canvas) }) });
  };

  const startOver = () => {
    stopResultPause();
    setVisualHints(null);
    setEditor(clearProgram(editor));
    runner.reset();
  };

  const stay = () => {
    setSolved(false);
    setVisualHints(null);
    runner.reset();
  };

  const flagged = visualHints?.flatMap((hint) => (hint.kind === 'bumped' ? hint.blockIds : [])) ?? [];
  const goButton = (
    <ControlButton
      kit={kit}
      speech={[strings.go]}
      picture={<GoPicture />}
      showLabel={layout === 'editor'}
      className='rp-go'
      data-variant='primary'
      data-control='go'
      disabled={solved || running}
      onClick={go}
    />
  );

  return (
    <div className='rp-screen' data-layout={layout} data-solved={solved} data-puzzle={puzzle?.id}>
      <figure className='rp-stage-area' ref={paper} aria-label={t(strings.drawing)}>
        <RobotStage
          canvas={world.canvas}
          robot={runner.view.robot}
          drawing={runner.view.drawing}
          target={puzzle?.target ?? null}
          finish={puzzle !== null && (puzzle.goal.kind === 'reach' || puzzle.goal.end !== null) ? puzzle.finish : null}
          hints={visualHints}
          bump={runner.view.bump}
          tweenMs={kit.reducedMotion ? 0 : Math.round(runner.pause * 0.85)}
          scope={kit.scope}
          clock={kit.clock}
        />
        {solved && (
          <div className='rp-choices' ref={choices} tabIndex={-1} data-choices=''>
            <ControlButton
              kit={kit}
              speech={[strings.nextPicture]}
              picture={<NextPicture />}
              className='rp-choice'
              data-choice='next'
              onClick={() => kit.roundComplete()}
            />
            <ControlButton
              kit={kit}
              speech={[strings.stayHere]}
              picture={<StayPicture />}
              className='rp-choice'
              data-choice='stay'
              onClick={stay}
            />
          </div>
        )}
      </figure>

      {layout === 'editor' && (
        <ProgramEditor
          kit={kit}
          editor={editor}
          toolbox={toolbox}
          limit={limit}
          locked={running || solved}
          active={runner.view.active}
          flagged={flagged}
          onChange={edit}
          onRefused={refused}
        />
      )}

      {layout === 'plan' && (
        <PlanStrip
          kit={kit}
          blocks={editor.program.blocks}
          places={limit}
          activeId={runner.view.active?.blockId ?? null}
          disabled={running || solved}
          onRemove={(id) => edit(commit(editor, removeBlock(editor.program, id)).state)}
        />
      )}

      <fieldset className='rp-controls' aria-label={t(strings.controls)}>
        {layout === 'editor' ? (
          <>
            {goButton}
            <ControlButton
              kit={kit}
              speech={[strings.stepOnce]}
              picture={<StepPicture />}
              data-control='step'
              disabled={solved || running}
              onClick={stepOnce}
            />
            <ControlButton
              kit={kit}
              speech={[strings.robotToStart]}
              picture={<ToStartPicture />}
              data-control='to-start'
              disabled={solved}
              onClick={robotToStart}
            />
            <ControlButton
              kit={kit}
              speech={[strings.undo]}
              picture={<UndoPicture />}
              data-control='undo'
              disabled={solved || running || editor.past.length === 0}
              onClick={() => edit(undo(editor))}
            />
            <ControlButton
              kit={kit}
              speech={[strings.startOver]}
              picture={<StartOverPicture />}
              data-control='start-over'
              disabled={solved || running}
              onClick={() => edit(clearProgram(editor))}
            />
            {mode.kind === 'free' && <PaintItButton kit={kit} onClick={paintIt} />}
          </>
        ) : (
          <>
            <ArrowPad
              kit={kit}
              directions={directions}
              disabled={solved || running}
              onArrow={(direction) => (layout === 'direct' ? press : plan)({ kind: 'move', direction })}
              center={layout === 'plan' ? goButton : undefined}
            />
            {mode.kind === 'free' && (
              <>
                <ColorChoices
                  kit={kit}
                  colors={penColors}
                  current={runner.view.robot.color}
                  onColor={(color) => press({ kind: 'color', color })}
                />
                <div className='rp-free-actions'>
                  <ControlButton
                    kit={kit}
                    speech={[strings.startOver]}
                    picture={<StartOverPicture />}
                    showLabel={false}
                    data-control='start-over'
                    onClick={startOver}
                  />
                  <PaintItButton kit={kit} onClick={paintIt} showLabel={false} />
                </div>
              </>
            )}
          </>
        )}
      </fieldset>
    </div>
  );
}

function PaintItButton({
  kit,
  onClick,
  showLabel = true,
}: {
  kit: ActivityKit;
  onClick: () => void;
  showLabel?: boolean;
}) {
  return (
    <ControlButton
      kit={kit}
      speech={[strings.paintIt]}
      picture={<Emoji id='paintbrush' decorative className='rp-picture' />}
      showLabel={showLabel}
      data-control='paint-it'
      onClick={onClick}
    />
  );
}
