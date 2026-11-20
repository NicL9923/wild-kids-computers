import { useLayoutEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import type { ActivityKit } from '../../../activityShell/kit.ts';
import { useCarry, type Carry } from '../../../activityShell/carry/useCarry.ts';
import { Emoji } from '../../../components/ui/Emoji.tsx';
import { t, type SpokenHandle } from '../../../core/strings/defineStrings.ts';
import { BlockPicture, NewBlockPicture } from '../blocks/BlockPicture.tsx';
import { blockSpeech, NAME_PICTURES, nameSpeech } from '../blocks/speech.ts';
import { DEFINITION_NAMES, type Block, type BlockDraft, type DefinitionName, type Program } from '../engine/program.ts';
import type { ToolboxItem } from '../engine/toolbox.ts';
import type { RunView } from '../stage/useRobotRun.ts';
import { strings } from '../strings.ts';
import { chooseTarget, commit, type EditorState } from './editorState.ts';
import { blockValue, paletteFor, stepValue, valueChoices, type PaletteEntry } from './palette.ts';
import {
  addDefinition,
  insertBlock,
  listBlocks,
  MAIN,
  moveBlock,
  removeBlock,
  removeDefinition,
  type EditRefusal,
  type EditResult,
  type ListKey,
  updateBlock,
} from './programEdit.ts';

/**
 * The toolbox and the program for every band above the youngest. A click on a toolbox block adds
 * it to the end of the chosen list; a drag puts it anywhere. A placed block is picked up by a
 * click or a drag and put into a gap, or onto "take the block out". Everything also works from
 * the keyboard: Enter on a toolbox block adds it, Enter on a placed block picks it up, the arrow
 * keys choose a place, and Enter puts it there.
 */

type CarryItem = `tool:${string}` | `block:${string}`;
type CarryTarget = `slot:${string}` | 'remove';

const slotId = (list: ListKey, index: number): CarryTarget => `slot:${list}:${String(index)}`;

function parseSlot(target: CarryTarget): { list: ListKey; index: number } | null {
  if (target === 'remove') return null;
  const body = target.slice('slot:'.length);
  const split = body.lastIndexOf(':');
  return { list: body.slice(0, split), index: Number(body.slice(split + 1)) };
}

/** Spoken names as one label for a screen reader, such as "forward 4". */
function labelOf(handles: readonly SpokenHandle[]): string {
  return handles.map((handle) => t(handle)).join(' ');
}

export interface ProgramEditorProps {
  readonly kit: Pick<ActivityKit<unknown>, 'scope' | 'play' | 'speak' | 'speakSequence'>;
  readonly editor: EditorState;
  readonly toolbox: readonly ToolboxItem[];
  readonly limit: number;
  /** While the robot runs, nothing can change. */
  readonly locked: boolean;
  readonly active: RunView['active'];
  /** Blocks to point out, such as the ones that bumped the edge. */
  readonly flagged: readonly string[];
  readonly onChange: (next: EditorState) => void;
  readonly onRefused: (reason: EditRefusal) => void;
}

interface ListContext {
  readonly carry: Carry<CarryItem, CarryTarget>;
  readonly editor: EditorState;
  readonly toolbox: readonly ToolboxItem[];
  readonly active: RunView['active'];
  readonly flagged: readonly string[];
  readonly kit: ProgramEditorProps['kit'];
  /** Whether the press that led to a click was the click that put a carried block down. */
  readonly wasCarrying: { current: boolean };
  readonly apply: (result: EditResult, target?: ListKey) => void;
  readonly choose: (list: ListKey) => void;
}

export function ProgramEditor(props: ProgramEditorProps) {
  const { kit, editor, toolbox, limit, locked, onChange, onRefused } = props;
  const [naming, setNaming] = useState(false);
  const wasCarrying = useRef(false);
  const palette = useMemo(() => paletteFor(toolbox, editor.program), [toolbox, editor.program]);
  // The newest program and toolbox, for carry callbacks that outlive a render.
  const live = useRef({ editor, palette });
  useLayoutEffect(() => {
    live.current = { editor, palette };
  });

  const apply = (result: EditResult, target?: ListKey) => {
    const next = commit(live.current.editor, result, target);
    if (next.refusal !== null) onRefused(next.refusal);
    else onChange(next.state);
  };

  /** Adds a toolbox block at the end of the chosen list. A new repeat becomes the place to add next. */
  const add = (entry: PaletteEntry & { kind: 'block' }, slot?: { list: ListKey; index: number }) => {
    const current = live.current.editor;
    const list = slot?.list ?? current.target;
    const blocks = listBlocks(current.program, list) ?? [];
    const index = slot?.index ?? blocks.length;
    const result = insertBlock(current.program, { list, index }, entry.draft, limit);
    const added = result.ok ? listBlocks(result.program, list)?.[index] : undefined;
    kit.play('snap');
    apply(result, added?.kind === 'repeat' ? added.id : list);
  };

  const carry = useCarry<CarryItem, CarryTarget>(kit, {
    kind: 'targets',
    accepts: (item, target) => {
      if (target === 'remove') return item.startsWith('block:');
      const slot = parseSlot(target);
      if (slot === null) return false;
      if (item.startsWith('tool:')) return true;
      const moved = moveBlock(live.current.editor.program, item.slice('block:'.length), slot, Number.POSITIVE_INFINITY);
      return moved.ok || moved.reason !== 'into-itself';
    },
    onDrop: (item, target) => {
      const program = live.current.editor.program;
      if (item.startsWith('tool:')) {
        const entry = live.current.palette.find((each) => `tool:${each.key}` === item);
        const slot = parseSlot(target);
        if (entry?.kind === 'block' && slot !== null) add(entry, slot);
        return;
      }
      const id = item.slice('block:'.length);
      if (target === 'remove') {
        apply(removeBlock(program, id));
        return;
      }
      const slot = parseSlot(target);
      if (slot !== null) apply(moveBlock(program, id, slot, limit));
    },
    onClick: (item) => {
      if (!item.startsWith('tool:')) return false;
      const entry = live.current.palette.find((each) => `tool:${each.key}` === item);
      if (entry?.kind === 'block') add(entry);
      return true;
    },
  });

  const choose = (list: ListKey) => onChange(chooseTarget(live.current.editor, list));
  const context: ListContext = {
    carry,
    editor,
    toolbox,
    active: props.active,
    flagged: props.flagged,
    kit,
    wasCarrying,
    apply,
    choose,
  };
  const carryingBlock = carry.carried?.startsWith('block:') === true;

  return (
    <div
      className='rp-editor'
      inert={locked}
      data-carrying={carry.carried !== null}
      onPointerDownCapture={() => {
        wasCarrying.current = carry.carried !== null;
      }}
      onKeyDownCapture={() => {
        wasCarrying.current = false;
      }}
    >
      <section className='rp-toolbox' aria-label={t(strings.blocks)}>
        <ul className='rp-toolbox-list'>
          {palette.map((entry) => (
            <li key={entry.key}>
              {entry.kind === 'block' ? (
                <ToolButton entry={entry} carry={carry} kit={kit} />
              ) : (
                <SpokenButton
                  kit={kit}
                  speech={[strings.newBlock]}
                  className='rp-tool'
                  data-tool='define'
                  aria-expanded={naming}
                  onClick={() => {
                    setNaming(!naming);
                    if (!naming) void kit.speak(strings.pickName);
                  }}
                >
                  <NewBlockPicture />
                </SpokenButton>
              )}
            </li>
          ))}
        </ul>
        {naming && (
          <NamePicker
            kit={kit}
            program={editor.program}
            onPick={(name) => {
              setNaming(false);
              const result = addDefinition(live.current.editor.program, name, limit);
              const made = result.ok ? result.program.definitions.find((each) => each.name === name) : undefined;
              apply(result, made?.id);
            }}
          />
        )}
      </section>
      <section className='rp-program' aria-label={t(strings.program)}>
        <div className='rp-program-scroll'>
          <BlockList list={MAIN} blocks={editor.program.blocks} context={context} />
          {editor.program.definitions.map((definition) => (
            <section key={definition.id} className='rp-definition' data-definition={definition.name}>
              <header
                className='rp-definition-head'
                data-running={props.active?.within.includes(definition.id) === true}
              >
                <Emoji id={NAME_PICTURES[definition.name]} decorative className='rp-definition-picture' />
                <span className='wk-reading-text'>{t(nameSpeech(definition.name))}</span>
                <SpokenButton
                  kit={kit}
                  speech={[strings.removeDefinition]}
                  className='rp-small-button'
                  data-remove-definition={definition.name}
                  onClick={() => apply(removeDefinition(live.current.editor.program, definition.id))}
                >
                  <TakeOutPicture />
                </SpokenButton>
              </header>
              <BlockList list={definition.id} blocks={definition.body} context={context} />
            </section>
          ))}
        </div>
        {/* Ordered visually to the top by CSS so keyboard carry lands on a program slot first instead of remove. */}
        <SpokenButton
          kit={kit}
          speech={[strings.takeOut]}
          className='rp-take-out'
          data-ready={carryingBlock}
          {...carry.target('remove')}
        >
          <TakeOutPicture />
        </SpokenButton>
      </section>
    </div>
  );
}

/** A button that says its name when the pointer comes onto it or it gets focus. */
function SpokenButton({
  kit,
  speech,
  children,
  ...props
}: {
  kit: ProgramEditorProps['kit'];
  speech: readonly SpokenHandle[];
  children: ReactNode;
} & Omit<ComponentProps<'button'>, 'type' | 'aria-label' | 'children'>) {
  const say = () => void kit.speakSequence(speech);
  return (
    <button type='button' aria-label={labelOf(speech)} onPointerEnter={say} onFocus={say} {...props}>
      {children}
    </button>
  );
}

function ToolButton({
  entry,
  carry,
  kit,
}: {
  entry: PaletteEntry & { kind: 'block' };
  carry: Carry<CarryItem, CarryTarget>;
  kit: ProgramEditorProps['kit'];
}) {
  const speech = blockSpeech(entry.draft);
  const say = () => void kit.speakSequence(speech);
  const { 'aria-pressed': _pressed, ...item } = carry.item(`tool:${entry.key}`);
  return (
    <button
      type='button'
      className='rp-tool'
      data-tool={entry.key}
      aria-label={labelOf(speech)}
      onPointerEnter={say}
      onFocus={say}
      {...item}
    >
      <BlockPicture block={entry.draft} />
      <BlockValue block={entry.draft} />
    </button>
  );
}

function BlockValue({ block }: { block: BlockDraft }) {
  const value =
    block.kind === 'repeat'
      ? block.count
      : block.kind === 'forward'
        ? block.distance
        : block.kind === 'turn'
          ? block.angle
          : null;
  if (value === null) return null;
  return (
    <span className='rp-block-value' aria-hidden='true'>
      {value}
    </span>
  );
}

function BlockList({ list, blocks, context }: { list: ListKey; blocks: readonly Block[]; context: ListContext }) {
  const { carry, editor } = context;
  const carrying = carry.carried !== null;
  const selected = editor.target === list;
  return (
    <ol className='rp-list' data-list={list}>
      {blocks.map((block, index) => (
        <li key={block.id} className='rp-list-item'>
          {carrying && <Gap list={list} index={index} carry={carry} />}
          <ProgramBlock block={block} context={context} />
        </li>
      ))}
      <li className='rp-list-item'>
        <SpokenButton
          kit={context.kit}
          speech={[strings.putHere]}
          className='rp-end-slot'
          data-end-slot={list}
          data-selected={selected}
          {...carry.target(slotId(list, blocks.length))}
          onClick={() => {
            if (!context.wasCarrying.current) context.choose(list);
          }}
        >
          <PutHerePicture selected={selected} />
        </SpokenButton>
      </li>
    </ol>
  );
}

function Gap({ list, index, carry }: { list: ListKey; index: number; carry: Carry<CarryItem, CarryTarget> }) {
  return <div className='rp-gap' data-gap={`${list}:${String(index)}`} {...carry.target(slotId(list, index))} />;
}

function ProgramBlock({ block, context }: { block: Block; context: ListContext }) {
  const { carry, kit, active, flagged, toolbox } = context;
  const speech = blockSpeech(block);
  const say = () => void kit.speakSequence(speech);
  const choices = valueChoices(block, toolbox);
  const value = blockValue(block);
  const change = (delta: 1 | -1) => {
    const next = stepValue(block, toolbox, delta);
    if (next === null) return;
    context.apply(updateBlock(context.editor.program, block.id, () => next));
    void kit.speakSequence(blockSpeech(next));
  };
  return (
    <div
      className='rp-block'
      data-block-id={block.id}
      data-kind={block.kind}
      data-running={active?.blockId === block.id}
      data-running-within={active?.within.includes(block.id) === true}
      data-flagged={flagged.includes(block.id)}
    >
      <div className='rp-block-row'>
        <button
          type='button'
          className='rp-block-button'
          aria-label={labelOf(speech)}
          onPointerEnter={say}
          onFocus={say}
          {...carry.item(`block:${block.id}`)}
        >
          <BlockPicture block={block} />
        </button>
        {choices !== null && value !== null && (
          <span className='rp-stepper'>
            <SpokenButton
              kit={kit}
              speech={[strings.fewer]}
              className='rp-small-button'
              data-step='fewer'
              disabled={choices[0] === undefined || value <= choices[0]}
              onClick={() => change(-1)}
            >
              <MinusPicture />
            </SpokenButton>
            <span className='rp-stepper-value' data-value={value} aria-hidden='true'>
              {value}
            </span>
            <SpokenButton
              kit={kit}
              speech={[strings.more]}
              className='rp-small-button'
              data-step='more'
              disabled={choices.at(-1) === undefined || value >= (choices.at(-1) ?? value)}
              onClick={() => change(1)}
            >
              <PlusPicture />
            </SpokenButton>
          </span>
        )}
      </div>
      {block.kind === 'repeat' && <BlockList list={block.id} blocks={block.body} context={context} />}
    </div>
  );
}

function NamePicker({
  kit,
  program,
  onPick,
}: {
  kit: ProgramEditorProps['kit'];
  program: Program;
  onPick: (name: DefinitionName) => void;
}) {
  const taken = new Set(program.definitions.map((definition) => definition.name));
  return (
    <ul className='rp-names' data-names=''>
      {DEFINITION_NAMES.filter((name) => !taken.has(name)).map((name) => (
        <li key={name}>
          <SpokenButton
            kit={kit}
            speech={[nameSpeech(name)]}
            className='rp-tool'
            data-name={name}
            onClick={() => onPick(name)}
          >
            <Emoji id={NAME_PICTURES[name]} decorative className='rp-picture' />
          </SpokenButton>
        </li>
      ))}
    </ul>
  );
}

function SmallSvg({ children }: { children: ReactNode }) {
  return (
    <svg className='rp-picture' viewBox='0 0 48 48' aria-hidden='true' focusable='false'>
      {children}
    </svg>
  );
}

function MinusPicture() {
  return (
    <SmallSvg>
      <path d='M12 24h24' stroke='currentColor' strokeWidth='6' strokeLinecap='round' />
    </SmallSvg>
  );
}

function PlusPicture() {
  return (
    <SmallSvg>
      <path d='M12 24h24M24 12v24' stroke='currentColor' strokeWidth='6' strokeLinecap='round' />
    </SmallSvg>
  );
}

/** A block lifting out of a tray. */
function TakeOutPicture() {
  return (
    <SmallSvg>
      <path d='M6 30v10h36V30' fill='none' stroke='currentColor' strokeWidth='4' strokeLinejoin='round' />
      <rect x='15' y='16' width='18' height='12' rx='3' fill='currentColor' />
      <path
        d='M24 4v8M19 8l5-5 5 5'
        fill='none'
        stroke='currentColor'
        strokeWidth='4'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    </SmallSvg>
  );
}

/** The place new blocks go: a filled pointer when it is the chosen place, an outline otherwise. */
function PutHerePicture({ selected }: { selected: boolean }) {
  return (
    <SmallSvg>
      <path
        d='M10 12 26 24 10 36z'
        fill={selected ? 'currentColor' : 'none'}
        stroke='currentColor'
        strokeWidth='4'
        strokeLinejoin='round'
      />
      <path d='M32 24h10M37 19v10' stroke='currentColor' strokeWidth='4' strokeLinecap='round' />
    </SmallSvg>
  );
}
