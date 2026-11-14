import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBand, usePictures, useSessionLength, useStorageProblems } from '../../../app/session/sessionHooks.ts';
import type { ProfilePictures } from '../../../app/session/sessionStore.ts';
import { useAudio, useMute } from '../../../audio/AudioProvider.tsx';
import type { ContinuousSound } from '../../../audio/audioEngine.ts';
import { IconButton } from '../../../components/ui/IconButton.tsx';
import { InterfaceIcon } from '../../../components/ui/InterfaceIcon.tsx';
import { Screen } from '../../../components/ui/Screen.tsx';
import { TextField } from '../../../components/ui/TextField.tsx';
import { Button } from '../../../components/ui/Button.tsx';
import type { Color } from '../../../core/paint/color.ts';
import { DOCUMENT_HEIGHT, DOCUMENT_WIDTH, PAPER } from '../../../core/paint/document.ts';
import type { GlyphTable } from '../../../core/paint/glyphs.ts';
import type { StrokePainter } from '../../../core/paint/session.ts';
import { createSurface, surfaceFromData, type Surface } from '../../../core/paint/surface.ts';
import type { PictureEffect, ShapeSettings, ToolPoint, ToolSettings } from '../../../core/paint/types.ts';
import { t, type SpokenHandle } from '../../../core/strings/defineStrings.ts';
import { strings as emojiNames, type EmojiId } from '../../../core/strings/shared/emoji.ts';
import { coloringPageById } from '../../../registry/coloringPages.ts';
import { emojiUrl } from '../../../registry/emoji.ts';
import { brushTips, paintFonts, paintTools } from '../../../registry/paint.ts';
import type { ColoringPage } from '../coloringPage.ts';
import { HOME_PATH, PAINT_GALLERY_PATH, SESSION_CLOSING_PATH } from '../paths.ts';
import { clearStartingPicture, paintLines, peekStartingPicture, type StartingPicture } from '../startingPicture.ts';
import { strings } from '../strings.ts';
import { createStudioScope, type StudioScope } from '../studioScope.ts';
import { createEffectRunner, startEffectWorker, type EffectRunner } from '../worker/effectRunner.ts';
import { Autosaver } from './autosave.ts';
import { decodePngUrl, fitOnPaper, rasterizeSvg } from './browserPixels.ts';
import { EmojiPicture, Glyph, SizeDot, StudioButton } from './controls.tsx';
import { Palette } from './Palette.tsx';
import { EffectPanel, PagePanel, ShapePanel, StampPanel, TipPanel } from './panels.tsx';
import { decodePicture, encodePicture } from './pictureFile.ts';
import { fillPreview, shapePreview, tipPreview } from './previews.ts';
import { StudioCanvas, type StudioCanvasHandle, type ToolDriver } from './StudioCanvas.tsx';
import { StudioDocument } from './studioDocument.ts';
import {
  FILL_STYLE_IDS,
  FILL_STYLE_NAMES,
  SHAPE_NAMES,
  SIZE_NAMES,
  STAMP_TURN,
  TOOL_NAMES,
  defaultSizeIndex,
  effectName,
  effectsFor,
  fillStyle,
  isYoungest,
  paletteFor,
  penBehavior,
  sizesFor,
  tipName,
  toolsFor,
  type FillStyleId,
  type StudioToolId,
} from './studioOptions.ts';
import { SurfaceImage } from './SurfaceImage.tsx';
import { unflattenUnderMask } from './unflatten.ts';

/** How long painting must pause before the picture saves itself. */
const AUTOSAVE_DELAY_MS = 1500;
/** How often the studio asks whether the session length is used up. */
const SESSION_CHECK_MS = 2000;
/** Brush speed, in document pixels per millisecond, that makes the brush sound loudest. */
const LOUDEST_SPEED = 3;

type Panel = 'stamps' | 'effects' | 'pages' | 'tips' | 'shapes';

interface StudioRuntime {
  readonly scope: StudioScope;
  readonly runner: EffectRunner;
}

const TOOL_PICTURES: Readonly<Record<StudioToolId, React.ReactNode>> = {
  brush: <EmojiPicture id='paintbrush' />,
  eraser: <EmojiPicture id='sponge' />,
  line: <Glyph name='line' />,
  shapes: <Glyph name='shapes' />,
  fill: <EmojiPicture id='bucket' />,
  text: <Glyph name='letters' />,
  stamp: <EmojiPicture id='butterfly' />,
  effects: <EmojiPicture id='sparkles' />,
};

function toolById(id: string) {
  const tool = paintTools.find((item) => item.id === id);
  // Unreachable while the registry test passes: the engine registers all seven tools.
  if (tool === undefined) throw new Error(`The paint tool "${id}" is missing.`);
  return tool;
}

function pictureFromStart(start: StartingPicture): Surface {
  if (start.kind === 'lines') return paintLines(start);
  const source = surfaceFromData(start.width, start.height, start.data);
  return start.width === DOCUMENT_WIDTH && start.height === DOCUMENT_HEIGHT
    ? source
    : fitOnPaper(source, DOCUMENT_WIDTH, DOCUMENT_HEIGHT);
}

/** Opens a gallery picture, with its coloring page lines back on their own layer. Null when it cannot be read. */
async function openGalleryPicture(pictures: ProfilePictures, id: string): Promise<StudioDocument | null> {
  const read = await pictures.read(id, 'picture');
  if (!read.ok) return null;
  try {
    const { picture, pageId } = await decodePicture(read.value);
    const page = pageId === null ? undefined : coloringPageById(pageId);
    const mask = page === undefined ? null : await decodePngUrl(page.mask);
    const studio = new StudioDocument();
    studio.load(mask === null ? picture : unflattenUnderMask(picture, mask), mask, page?.id ?? null);
    return studio;
  } catch {
    return null;
  }
}

function nextSeed(seed: number): number {
  return (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
}

export function PaintStudioScreen({ pictureId }: { pictureId: string | null }) {
  const band = useBand();
  const audio = useAudio();
  const [muted, toggleMute] = useMute();
  const pictures = usePictures();
  const { isLimitReached } = useSessionLength();
  const { saveProblem } = useStorageProblems();
  const navigate = useNavigate();
  const youngest = isYoungest(band);

  const [runtime, setRuntime] = useState<StudioRuntime | null>(null);
  const [warm, setWarm] = useState(false);
  const [studio, setStudio] = useState(() => new StudioDocument());
  const [loaded, setLoaded] = useState(false);
  const [, setRenderCount] = useState(0);
  const saverRef = useRef<Autosaver | null>(null);
  const canvasRef = useRef<StudioCanvasHandle | null>(null);
  const studioRef = useRef(studio);
  studioRef.current = studio;

  const tools = toolsFor(band);
  const sizes = sizesFor(band);
  const effects = effectsFor(band);
  const [tool, setTool] = useState<StudioToolId>('brush');
  const [color, setColor] = useState<Color>(() => paletteFor(band)[0]?.color ?? PAPER);
  const [sizeIndex, setSizeIndex] = useState(() => defaultSizeIndex(band));
  const [tipId, setTipId] = useState('round');
  const [shape, setShape] = useState<ShapeSettings>({ kind: 'heart', style: 'filled' });
  const [fillStyleId, setFillStyleId] = useState<FillStyleId>('solid');
  const [stamp, setStamp] = useState<{ id: EmojiId; size: number; flipX: boolean; rotation: number }>({
    id: 'butterfly',
    size: defaultSizeIndex(band),
    flipX: false,
    rotation: 0,
  });
  const [stampBitmap, setStampBitmap] = useState<{ key: string; surface: Surface } | null>(null);
  const [effectId, setEffectId] = useState<string>(effects[0]?.id ?? 'confetti');
  const [panel, setPanel] = useState<Panel | null>(null);
  const [busy, setBusy] = useState(false);
  const [penIsDown, setPenIsDown] = useState(false);
  const [text, setText] = useState<{ at: ToolPoint; content: string } | null>(null);
  const [font, setFont] = useState<GlyphTable | null>(null);
  const seedRef = useRef(Date.now() >>> 0);
  const sound = useRef<ContinuousSound | null>(null);
  const lastMove = useRef<{ point: ToolPoint; time: number } | null>(null);
  const leaving = useRef(false);
  const textInput = useRef<HTMLInputElement>(null);

  const say = useCallback((handle: SpokenHandle) => void audio.speak(handle), [audio]);
  const effect = effects.find((item) => item.id === effectId);
  const tip = brushTips.find((item) => item.id === tipId) ?? brushTips[0];
  const sizeChoice = sizes[Math.min(sizeIndex, sizes.length - 1)] ?? sizes[0];
  const stampSize = (sizes[Math.min(stamp.size, sizes.length - 1)] ?? sizes[0])?.stamp ?? 170;

  // The timers, frames, and worker live as long as the screen.
  useEffect(() => {
    const scope = createStudioScope();
    const runner = createEffectRunner(startEffectWorker);
    let live = true;
    void (async () => {
      await runner.warm();
      if (live) setWarm(true);
    })();
    setRuntime({ scope, runner });
    return () => {
      live = false;
      scope.dispose();
      runner.dispose();
    };
  }, []);

  const makeSaver = useCallback(
    (owner: StudioDocument, id: string | null, savedVersion: number, scope: StudioScope) =>
      new Autosaver(
        { scope, delayMs: AUTOSAVE_DELAY_MS, encode: () => encodePicture(owner), save: pictures.save },
        id,
        savedVersion,
      ),
    [pictures],
  );

  /** Shows another picture. The old one saves first if it changed. */
  const switchPicture = useCallback(
    (next: StudioDocument, id: string | null, savedVersion: number) => {
      if (runtime === null) return;
      void saverRef.current?.flush();
      saverRef.current = makeSaver(next, id, savedVersion, runtime.scope);
      setStudio(next);
    },
    [makeSaver, runtime],
  );

  // Open the starting picture, the gallery picture, or blank paper.
  useEffect(() => {
    if (runtime === null) return undefined;
    let cancelled = false;
    async function open(): Promise<void> {
      const start = peekStartingPicture();
      let next = new StudioDocument();
      let id: string | null = null;
      if (start !== null) {
        next.replace(pictureFromStart(start), null, null);
      } else if (pictureId !== null) {
        const opened = await openGalleryPicture(pictures, pictureId);
        if (opened !== null) {
          next = opened;
          id = pictureId;
        }
      }
      if (cancelled) return;
      if (start !== null) clearStartingPicture(start);
      // A starting picture is new work, so it saves. An opened picture saves only after a change.
      switchPicture(next, id, start === null ? next.version : 0);
      if (start !== null) saverRef.current?.changed(next.version);
      setLoaded(true);
      say(strings.instruction);
    }
    void open();
    return () => {
      cancelled = true;
    };
    // Opens once per screen; the key on this component changes for another picture.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [runtime]);

  // Save after a pause, and re-render when the picture changes so undo and redo stay current.
  useEffect(() => {
    return studio.subscribe(() => {
      saverRef.current?.changed(studio.version);
      setRenderCount((count) => count + 1);
    });
  }, [studio]);

  // Save when leaving, however the child leaves.
  useEffect(() => () => void saverRef.current?.flush(), []);

  // The text tool's letters load on first need.
  useEffect(() => {
    if (youngest) return undefined;
    let live = true;
    const load = paintFonts.get('meadow-sans');
    void (async () => {
      const table = await load?.();
      if (live && table !== undefined) setFont(table);
    })();
    return () => {
      live = false;
    };
  }, [youngest]);

  // Draw the chosen stamp at the size it will land, so it stays sharp.
  const stampKey = `${stamp.id}@${stampSize}`;
  useEffect(() => {
    let live = true;
    void (async () => {
      const surface = await rasterizeSvg(emojiUrl(stamp.id), stampSize);
      if (live) setStampBitmap({ key: stampKey, surface });
    })();
    return () => {
      live = false;
    };
  }, [stamp.id, stampSize, stampKey]);

  const hasContent = (): boolean => {
    const saver = saverRef.current;
    return saver !== null && (saver.pictureId !== null || saver.hasUnsavedChanges);
  };

  /** Puts down any letters being typed and lifts the pen. */
  const settle = useCallback(() => {
    canvasRef.current?.lift();
    studioRef.current.end();
    setText(null);
  }, []);

  const leave = useCallback(
    async (to: string) => {
      if (leaving.current) return;
      leaving.current = true;
      settle();
      await saverRef.current?.flush();
      await navigate({ to });
    },
    [navigate, settle],
  );

  // When the parent's session length is used up, wait for the pen to lift, save, and close calmly.
  useEffect(() => {
    if (runtime === null) return undefined;
    return runtime.scope.setInterval(() => {
      if (canvasRef.current?.penDown === true || busy || studioRef.current.stroking) return;
      if (isLimitReached()) void leave(SESSION_CLOSING_PATH);
    }, SESSION_CHECK_MS);
  }, [runtime, busy, isLimitReached, leave]);

  const runWholePicture = useCallback(
    async (chosen: PictureEffect) => {
      if (runtime === null || busy) return;
      settle();
      const target = studioRef.current;
      setBusy(true);
      audio.play('sparkle');
      try {
        const pixels = await runtime.runner.run(chosen, target.doc.paint);
        if (studioRef.current === target && !runtime.scope.disposed) target.replacePaint(pixels);
      } finally {
        if (!runtime.scope.disposed) setBusy(false);
      }
    },
    [audio, busy, runtime, settle],
  );

  // Letters follow the typing as a preview, and land when the child puts them on.
  useEffect(() => {
    if (text === null || font === null) return;
    const target = studioRef.current;
    target.cancel();
    if (text.content.trim() === '') return;
    target.begin(
      toolById('text'),
      {
        color,
        size: sizeChoice?.letters ?? 70,
        tip: toolTipFallback(),
        seed: 0,
        text: { content: text.content, font },
      },
      text.at,
    );
  }, [text, font, color, sizeChoice]);

  // Typing starts at once when the child picks where the letters go.
  const textOpen = text !== null;
  useEffect(() => {
    if (textOpen) textInput.current?.focus();
  }, [textOpen]);

  const placeText = (): void => {
    studioRef.current.end();
    setText(null);
    audio.play('put-down');
  };

  const settings = (): ToolSettings => {
    seedRef.current = nextSeed(seedRef.current);
    const base: ToolSettings = {
      color,
      size: sizeChoice?.brush ?? 32,
      tip: tip ?? toolTipFallback(),
      seed: seedRef.current,
      shape,
      fill: fillStyle(fillStyleId, color),
    };
    if (tool === 'stamp' && stampBitmap?.key === stampKey) {
      return {
        ...base,
        size: stampSize,
        stamp: { bitmap: stampBitmap.surface, rotation: stamp.rotation, flipX: stamp.flipX, flipY: false },
      };
    }
    return base;
  };

  const driver: ToolDriver = useMemo(() => {
    const behavior = penBehavior(tool, effect);
    const paintWith = (
      painterId: string | StrokePainter,
      onEnd?: () => void,
      continuous?: 'brush' | 'eraser',
    ): ToolDriver => ({
      behavior,
      ringSize: tool === 'fill' ? 0 : (sizeChoice?.brush ?? 32),
      begin(at) {
        const painter = typeof painterId === 'string' ? toolById(painterId) : painterId;
        studioRef.current.begin(painter, settings(), at);
        lastMove.current = { point: at, time: performance.now() };
        if (continuous !== undefined) {
          sound.current?.stop();
          sound.current = audio.startContinuous(continuous);
        }
      },
      move(points) {
        studioRef.current.move(points);
        const last = points.at(-1);
        const previous = lastMove.current;
        if (last === undefined || previous === null) return;
        const now = performance.now();
        const distance = Math.sqrt((last.x - previous.point.x) ** 2 + (last.y - previous.point.y) ** 2);
        const speed = distance / Math.max(1, now - previous.time);
        sound.current?.set(Math.min(1, speed / LOUDEST_SPEED));
        lastMove.current = { point: last, time: now };
      },
      end() {
        studioRef.current.end();
        sound.current?.stop();
        sound.current = null;
        onEnd?.();
      },
    });

    switch (tool) {
      case 'brush':
        return paintWith('brush', undefined, 'brush');
      case 'eraser':
        return paintWith('eraser', undefined, 'eraser');
      case 'line':
      case 'shapes':
        return paintWith(tool, () => audio.play('snap'));
      case 'fill':
        return paintWith('fill', () => audio.play('fill'));
      case 'stamp':
        return {
          ...paintWith('stamp', () => audio.play('stamp')),
          ringSize: 0,
          ghost: {
            url: emojiUrl(stamp.id),
            size: stampSize,
            transform: `rotate(${stamp.rotation}deg) scaleX(${stamp.flipX ? -1 : 1})`,
          },
        };
      case 'text':
        return {
          behavior,
          ringSize: 0,
          begin(at) {
            if (font === null) return;
            studioRef.current.end();
            setText({ at, content: '' });
          },
          move: () => undefined,
          end: () => undefined,
        };
      default:
        if (effect === undefined)
          return { behavior, ringSize: 0, begin: () => undefined, move: () => undefined, end: () => undefined };
        if (effect.group === 'whole-picture') {
          return {
            behavior,
            ringSize: 0,
            begin: () => void runWholePicture(effect),
            move: () => undefined,
            end: () => undefined,
          };
        }
        return paintWith(effect, undefined, 'brush');
    }
    // settings() reads the latest choices through these dependencies.
    // oxlint-disable-next-line react/exhaustive-deps
  }, [
    tool,
    effect,
    sizeChoice,
    color,
    tip,
    shape,
    fillStyleId,
    stamp,
    stampBitmap,
    stampSize,
    font,
    audio,
    runWholePicture,
  ]);

  function chooseTool(next: StudioToolId): void {
    settle();
    setPanel(next === 'stamp' ? 'stamps' : next === 'effects' ? 'effects' : null);
    setTool(next);
    say(TOOL_NAMES[next]);
  }

  function undo(): void {
    settle();
    studioRef.current.undo();
    audio.play('page-turn');
    say(strings.undo);
  }

  function redo(): void {
    settle();
    studioRef.current.redo();
    audio.play('page-turn');
    say(strings.redo);
  }

  function startOver(): void {
    settle();
    studioRef.current.startOver();
    audio.play('whoosh');
    say(strings.startOver);
  }

  function newPaper(): void {
    settle();
    say(strings.newPicture);
    audio.play('page-turn');
    if (!hasContent() && studioRef.current.mask === null) return;
    switchPicture(new StudioDocument(), null, 0);
  }

  async function openPage(page: ColoringPage): Promise<void> {
    setPanel(null);
    settle();
    say(page.title);
    const mask = await decodePngUrl(page.mask);
    const blank = createSurface(DOCUMENT_WIDTH, DOCUMENT_HEIGHT, PAPER);
    audio.play('page-turn');
    if (hasContent()) {
      // The picture so far stays in the gallery. The page starts a new one, and undo takes it off.
      const next = new StudioDocument();
      next.replace(blank, mask, page.id);
      switchPicture(next, null, next.version);
    } else {
      const current = studioRef.current;
      current.replace(blank, mask, page.id);
      // An untouched page is not a picture yet: it saves once the child paints on it.
      switchPicture(current, null, current.version);
    }
  }

  // Undo and redo from the keyboard, except while typing letters.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (!(event.ctrlKey || event.metaKey) || event.target instanceof HTMLInputElement) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault();
        undo();
      } else if (key === 'y' || (key === 'z' && event.shiftKey)) {
        event.preventDefault();
        redo();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const ready = loaded && warm && runtime !== null;
  const canUndo = !busy && studio.canUndo;
  const canRedo = !busy && studio.canRedo;
  const savingFailed = saveProblem !== null && saveProblem.target === `pictures/${pictures.profileId}`;

  const sizeControls = (
    <fieldset className='wk-paint-option-group' aria-label={t(strings.size)}>
      {sizes.map((size, index) => (
        <StudioButton
          key={size.id}
          className='wk-paint-size'
          label={t(SIZE_NAMES[size.id])}
          picture={<SizeDot fraction={0.2 + (0.8 * index) / Math.max(1, sizes.length - 1)} />}
          pressed={index === sizeIndex}
          onClick={() => {
            setSizeIndex(index);
            say(SIZE_NAMES[size.id]);
          }}
        />
      ))}
    </fieldset>
  );

  function options() {
    switch (tool) {
      case 'brush':
        return (
          <>
            {!youngest && tip !== undefined && (
              <StudioButton
                className='wk-paint-wide'
                label={t(strings.tips)}
                picture={<SurfaceImage surface={tipPreview(tip, color)} />}
                aria-expanded={panel === 'tips'}
                onClick={() => {
                  setPanel(panel === 'tips' ? null : 'tips');
                  say(strings.chooseTip);
                }}
              />
            )}
            {sizeControls}
          </>
        );
      case 'eraser':
      case 'line':
        return sizeControls;
      case 'shapes':
        return (
          <>
            <StudioButton
              className='wk-paint-wide'
              label={t(strings.shapes)}
              picture={<SurfaceImage surface={shapePreview(shape.kind, shape.style, color, 48)} />}
              aria-expanded={panel === 'shapes'}
              onClick={() => {
                setPanel(panel === 'shapes' ? null : 'shapes');
                say(strings.shapes);
              }}
            />
            <fieldset className='wk-paint-option-group' aria-label={t(strings.shapeStyle)}>
              {(['filled', 'outline'] as const).map((style) => (
                <StudioButton
                  key={style}
                  label={t(strings[style])}
                  picture={<SurfaceImage surface={shapePreview('ellipse', style, color, 40)} />}
                  pressed={shape.style === style}
                  onClick={() => {
                    setShape({ ...shape, style });
                    say(strings[style]);
                  }}
                />
              ))}
            </fieldset>
            {shape.style === 'outline' && sizeControls}
          </>
        );
      case 'fill':
        return youngest ? null : (
          <fieldset className='wk-paint-option-group' aria-label={t(strings.fillStyles)}>
            {FILL_STYLE_IDS.map((id) => (
              <StudioButton
                key={id}
                label={t(FILL_STYLE_NAMES[id])}
                picture={<SurfaceImage surface={fillPreview(fillStyle(id, color), color, 56, 36)} />}
                pressed={fillStyleId === id}
                onClick={() => {
                  setFillStyleId(id);
                  say(FILL_STYLE_NAMES[id]);
                }}
              />
            ))}
          </fieldset>
        );
      case 'text':
        return text === null ? (
          <p className='wk-paint-hint'>{t(strings.textHint)}</p>
        ) : (
          <>
            <TextField
              className='wk-paint-text-field'
              label={t(strings.textEntry)}
              value={text.content}
              maxLength={60}
              ref={textInput}
              onChange={(event) => setText({ ...text, content: event.currentTarget.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') placeText();
                if (event.key === 'Escape') {
                  studioRef.current.cancel();
                  setText(null);
                }
              }}
            />
            <Button variant='primary' onClick={placeText} disabled={text.content.trim() === ''}>
              {t(strings.placeText)}
            </Button>
            {sizeControls}
          </>
        );
      case 'stamp':
        return (
          <>
            <StudioButton
              className='wk-paint-wide'
              label={t(strings.chooseStamp)}
              picture={<EmojiPicture id={stamp.id} />}
              aria-expanded={panel === 'stamps'}
              onClick={() => {
                setPanel(panel === 'stamps' ? null : 'stamps');
                say(strings.chooseStamp);
              }}
            />
            <fieldset className='wk-paint-option-group' aria-label={t(strings.stampOptions)}>
              <StudioButton
                label={t(strings.smaller)}
                picture={<Glyph name='smaller' />}
                disabled={stamp.size === 0}
                onClick={() => {
                  setStamp({ ...stamp, size: Math.max(0, stamp.size - 1) });
                  say(strings.smaller);
                }}
              />
              <StudioButton
                label={t(strings.bigger)}
                picture={<Glyph name='bigger' />}
                disabled={stamp.size >= sizes.length - 1}
                onClick={() => {
                  setStamp({ ...stamp, size: Math.min(sizes.length - 1, stamp.size + 1) });
                  say(strings.bigger);
                }}
              />
              <StudioButton
                label={t(strings.flip)}
                picture={<Glyph name='flip' />}
                pressed={stamp.flipX}
                onClick={() => {
                  setStamp({ ...stamp, flipX: !stamp.flipX });
                  say(strings.flip);
                }}
              />
              {!youngest && (
                <StudioButton
                  label={t(strings.turn)}
                  picture={<Glyph name='turn' />}
                  onClick={() => {
                    setStamp({ ...stamp, rotation: (stamp.rotation + STAMP_TURN) % 360 });
                    say(strings.turn);
                  }}
                />
              )}
            </fieldset>
          </>
        );
      default:
        return (
          <>
            <StudioButton
              className='wk-paint-wide'
              label={t(strings.chooseEffect)}
              picture={<EmojiPicture id='sparkles' />}
              aria-expanded={panel === 'effects'}
              onClick={() => {
                setPanel(panel === 'effects' ? null : 'effects');
                say(strings.chooseEffect);
              }}
            />
            {effect !== undefined && (
              <span className='wk-paint-effect-name wk-reading-text'>{t(effectName(effect.id))}</span>
            )}
            {effect !== undefined && effect.group !== 'whole-picture' && sizeControls}
          </>
        );
    }
  }

  return (
    <div className='wk-paint-screen' data-ready={ready ? 'true' : undefined} data-tool={tool}>
      <Screen
        exit={
          <>
            <IconButton
              label={t(strings.exit)}
              icon={<InterfaceIcon name='exit' />}
              onClick={() => void leave(HOME_PATH)}
            />
            <IconButton
              label={t(strings.gallery)}
              icon={<EmojiPicture id='picture' />}
              onClick={() => {
                say(strings.gallery);
                void leave(PAINT_GALLERY_PATH);
              }}
            />
            <IconButton label={t(strings.newPicture)} icon={<Glyph name='paper' />} onClick={newPaper} />
            <IconButton
              label={t(strings.coloringPages)}
              icon={<EmojiPicture id='crayon' />}
              aria-expanded={panel === 'pages'}
              onClick={() => {
                setPanel(panel === 'pages' ? null : 'pages');
                say(strings.coloringPages);
              }}
            />
          </>
        }
        instruction={
          <IconButton
            label={t(strings.replay)}
            icon={<InterfaceIcon name='replay' />}
            onClick={() => say(strings.instruction)}
          />
        }
        end={
          <>
            <IconButton
              label={t(strings.undo)}
              icon={<InterfaceIcon name='undo' />}
              disabled={!canUndo}
              onClick={undo}
            />
            <IconButton
              label={t(strings.redo)}
              icon={<InterfaceIcon name='redo' />}
              disabled={!canRedo}
              onClick={redo}
            />
            <IconButton
              label={t(strings.startOver)}
              icon={<EmojiPicture id='broom' />}
              disabled={busy}
              onClick={startOver}
            />
            <IconButton
              label={t(muted ? strings.soundOff : strings.soundOn)}
              icon={<InterfaceIcon name={muted ? 'sound-off' : 'sound-on'} />}
              pressed={muted}
              onClick={toggleMute}
            />
          </>
        }
      >
        <h1 className='wk-paint-sr-only'>{t(strings.title)}</h1>
        <div className='wk-paint-studio'>
          <div className='wk-paint-tools' role='toolbar' aria-orientation='vertical' aria-label={t(strings.tools)}>
            {tools.map((id) => (
              <StudioButton
                key={id}
                data-tool={id}
                label={t(TOOL_NAMES[id])}
                picture={TOOL_PICTURES[id]}
                pressed={tool === id}
                onClick={() => chooseTool(id)}
              />
            ))}
          </div>
          <div className='wk-paint-center'>
            <div className='wk-paint-stage'>
              {runtime !== null && (
                <StudioCanvas
                  studio={studio}
                  driver={driver}
                  scope={runtime.scope}
                  busy={busy || !ready}
                  onPenChange={setPenIsDown}
                  handleRef={canvasRef}
                />
              )}
              {penIsDown && (
                <output className='wk-paint-pen-badge'>
                  <EmojiPicture id='paintbrush' />
                  <span className='wk-reading-text'>{t(strings.penDown)}</span>
                </output>
              )}
              {panel === 'stamps' && (
                <StampPanel
                  chosen={stamp.id}
                  onPick={(id) => {
                    setStamp({ ...stamp, id });
                    setPanel(null);
                    say(emojiNames[id]);
                  }}
                  onCategory={(category) => say(category.title)}
                  onClose={() => setPanel(null)}
                />
              )}
              {panel === 'effects' && (
                <EffectPanel
                  band={band}
                  effects={effects}
                  picture={studio.doc.paint}
                  color={color}
                  chosen={effectId}
                  onPick={(chosen) => {
                    setEffectId(chosen.id);
                    setPanel(null);
                    say(effectName(chosen.id));
                    if (chosen.group === 'whole-picture') void runWholePicture(chosen);
                  }}
                  onClose={() => setPanel(null)}
                />
              )}
              {panel === 'pages' && (
                <PagePanel band={band} onPick={(page) => void openPage(page)} onClose={() => setPanel(null)} />
              )}
              {panel === 'tips' && (
                <TipPanel
                  tips={brushTips}
                  color={color}
                  chosen={tipId}
                  onPick={(chosen) => {
                    setTipId(chosen.id);
                    setPanel(null);
                    say(tipName(chosen.id));
                  }}
                  onClose={() => setPanel(null)}
                />
              )}
              {panel === 'shapes' && (
                <ShapePanel
                  color={color}
                  style={shape.style}
                  chosen={shape.kind}
                  onPick={(kind) => {
                    setShape({ ...shape, kind });
                    setPanel(null);
                    say(SHAPE_NAMES[kind]);
                  }}
                  onClose={() => setPanel(null)}
                />
              )}
            </div>
            <div className='wk-paint-options'>
              {options()}
              {savingFailed && <output className='wk-paint-problem'>{t(strings.saveProblem)}</output>}
            </div>
          </div>
          <Palette
            band={band}
            color={color}
            onPick={(next, name) => {
              setColor(next);
              say(name);
            }}
          />
        </div>
      </Screen>
    </div>
  );
}

function toolTipFallback() {
  const first = brushTips[0];
  // Unreachable while the registry test passes: the engine registers twelve tips.
  if (first === undefined) throw new Error('No brush tips are registered.');
  return first;
}
