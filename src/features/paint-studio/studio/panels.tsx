import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Band } from '../../../core/bands.ts';
import type { Color } from '../../../core/paint/color.ts';
import type { Surface } from '../../../core/paint/surface.ts';
import {
  EFFECT_GROUPS,
  SHAPE_KINDS,
  type BrushTip,
  type PaintEffect,
  type ShapeKind,
} from '../../../core/paint/types.ts';
import { t } from '../../../core/strings/defineStrings.ts';
import { strings as emojiNames, type EmojiId } from '../../../core/strings/shared/emoji.ts';
import { coloringPagesFor } from '../../../registry/coloringPages.ts';
import { stampCategories } from '../../../registry/stampCategories.ts';
import type { ColoringPage } from '../coloringPage.ts';
import { strings as effectNames } from '../effects/strings.ts';
import { strings } from '../strings.ts';
import { EmojiPicture, StudioButton } from './controls.tsx';
import { effectPreview, effectPreviewBase, shapePreview, tipPreview } from './previews.ts';
import { SHAPE_NAMES, effectName, isYoungest, tipName } from './studioOptions.ts';
import { SurfaceImage } from './SurfaceImage.tsx';

/**
 * A picker that opens over the picture. Focus moves into it, Escape or the close button shuts
 * it, and focus goes back to the control that opened it. It is not modal: the rest of the studio
 * stays usable, and choosing something closes it.
 */
export function PickerPanel({
  title,
  onClose,
  children,
  wide,
  placement,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** `beside` opens next to the control that opened it, such as the color mixer beside the colors. */
  placement?: 'beside';
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  // Layout effect so cleanup runs while the panel is still mounted and panel.contains(activeElement) is accurate.
  useLayoutEffect(() => {
    const panel = ref.current;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const chosen = panel?.querySelector<HTMLElement>('.wk-paint-panel-body [aria-pressed="true"]');
    const first = panel?.querySelector<HTMLElement>('.wk-paint-panel-body :is(button, input)');
    (chosen ?? first)?.focus();
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      closeRef.current();
    };
    panel?.addEventListener('keydown', onKey);
    return () => {
      panel?.removeEventListener('keydown', onKey);
      if (panel !== null && panel.contains(document.activeElement)) opener?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      open
      className='wk-paint-panel'
      data-wide={wide === true ? 'true' : undefined}
      data-placement={placement}
      aria-label={title}
    >
      <header className='wk-paint-panel-header'>
        <h2 className='wk-paint-panel-title wk-reading-text'>{title}</h2>
        <button
          type='button'
          className='wk-button wk-paint-close'
          data-shape='icon'
          aria-label={t(strings.close)}
          onClick={onClose}
        >
          <svg className='wk-paint-glyph' viewBox='0 0 24 24' aria-hidden='true' focusable='false'>
            <path d='M6 6l12 12M18 6L6 18' stroke='currentColor' strokeWidth='3.5' strokeLinecap='round' />
          </svg>
        </button>
      </header>
      <div className='wk-paint-panel-body'>{children}</div>
    </dialog>
  );
}

export function StampPanel({
  chosen,
  onPick,
  onCategory,
  onClose,
}: {
  chosen: EmojiId;
  onPick: (id: EmojiId) => void;
  onCategory: (title: (typeof stampCategories)[number]) => void;
  onClose: () => void;
}) {
  const initial = stampCategories.find((category) => category.stamps.includes(chosen)) ?? stampCategories[0];
  const [categoryId, setCategoryId] = useState(initial?.id);
  const category = stampCategories.find((item) => item.id === categoryId) ?? initial;
  return (
    <PickerPanel title={t(strings.chooseStamp)} onClose={onClose} wide>
      <div className='wk-paint-stamp-layout'>
        <fieldset className='wk-paint-categories' aria-label={t(strings.chooseStamp)}>
          {stampCategories.map((item) => (
            <StudioButton
              key={item.id}
              label={t(item.title)}
              picture={<EmojiPicture id={item.icon} />}
              pressed={item.id === category?.id}
              onClick={() => {
                setCategoryId(item.id);
                onCategory(item);
              }}
            />
          ))}
        </fieldset>
        <div className='wk-paint-grid' data-kind='stamps'>
          {category?.stamps.map((id) => (
            <StudioButton
              key={id}
              className='wk-paint-choice'
              label={t(emojiNames[id])}
              picture={<EmojiPicture id={id} />}
              pressed={id === chosen}
              onClick={() => onPick(id)}
            />
          ))}
        </div>
      </div>
    </PickerPanel>
  );
}

export function EffectPanel({
  band,
  effects,
  picture,
  color,
  chosen,
  onPick,
  onClose,
}: {
  band: Band;
  effects: readonly PaintEffect[];
  /** The child's picture right now, so each preview shows what the effect does to it. */
  picture: Surface;
  color: Color;
  chosen: string | null;
  onPick: (effect: PaintEffect) => void;
  onClose: () => void;
}) {
  const previews = useMemo(() => {
    const base = effectPreviewBase(picture);
    return new Map(effects.map((effect) => [effect.id, effectPreview(effect, base, color)]));
  }, [effects, picture, color]);
  const tile = (effect: PaintEffect) => {
    const preview = previews.get(effect.id);
    return (
      <StudioButton
        key={effect.id}
        className='wk-paint-choice'
        data-effect={effect.id}
        label={t(effectName(effect.id))}
        picture={preview === undefined ? null : <SurfaceImage surface={preview} />}
        pressed={effect.id === chosen}
        onClick={() => onPick(effect)}
      />
    );
  };
  return (
    <PickerPanel title={t(strings.chooseEffect)} onClose={onClose} wide>
      {isYoungest(band) ? (
        <div className='wk-paint-grid' data-kind='effects'>
          {effects.map(tile)}
        </div>
      ) : (
        EFFECT_GROUPS.map((group) => (
          <section key={group} className='wk-paint-group' aria-label={t(effectNames[`group-${group}`])}>
            <h3 className='wk-paint-group-title'>{t(effectNames[`group-${group}`])}</h3>
            <div className='wk-paint-grid' data-kind='effects'>
              {effects.filter((effect) => effect.group === group).map(tile)}
            </div>
          </section>
        ))
      )}
    </PickerPanel>
  );
}

export function PagePanel({
  band,
  onPick,
  onClose,
}: {
  band: Band;
  onPick: (page: ColoringPage) => void;
  onClose: () => void;
}) {
  return (
    <PickerPanel title={t(strings.coloringPages)} onClose={onClose} wide>
      <div className='wk-paint-grid' data-kind='pages'>
        {coloringPagesFor(band).map((page) => (
          <StudioButton
            key={page.id}
            className='wk-paint-choice'
            data-page={page.id}
            label={t(page.title)}
            picture={<img className='wk-paint-page-thumb' src={page.thumbnail} alt='' draggable={false} />}
            onClick={() => onPick(page)}
          />
        ))}
      </div>
    </PickerPanel>
  );
}

export function TipPanel({
  tips,
  color,
  chosen,
  onPick,
  onClose,
}: {
  tips: readonly BrushTip[];
  color: Color;
  chosen: string;
  onPick: (tip: BrushTip) => void;
  onClose: () => void;
}) {
  const previews = useMemo(() => new Map(tips.map((tip) => [tip.id, tipPreview(tip, color)])), [tips, color]);
  return (
    <PickerPanel title={t(strings.chooseTip)} onClose={onClose}>
      <div className='wk-paint-grid' data-kind='tips'>
        {tips.map((tip) => {
          const preview = previews.get(tip.id);
          return (
            <StudioButton
              key={tip.id}
              className='wk-paint-choice'
              label={t(tipName(tip.id))}
              picture={preview === undefined ? null : <SurfaceImage surface={preview} />}
              pressed={tip.id === chosen}
              onClick={() => onPick(tip)}
            />
          );
        })}
      </div>
    </PickerPanel>
  );
}

export function ShapePanel({
  color,
  style,
  chosen,
  onPick,
  onClose,
}: {
  color: Color;
  style: 'filled' | 'outline';
  chosen: ShapeKind;
  onPick: (kind: ShapeKind) => void;
  onClose: () => void;
}) {
  const previews = useMemo(
    () => new Map(SHAPE_KINDS.map((kind) => [kind, shapePreview(kind, style, color)])),
    [color, style],
  );
  return (
    <PickerPanel title={t(strings.shapes)} onClose={onClose}>
      <div className='wk-paint-grid' data-kind='shapes'>
        {SHAPE_KINDS.map((kind) => {
          const preview = previews.get(kind);
          return (
            <StudioButton
              key={kind}
              className='wk-paint-choice'
              label={t(SHAPE_NAMES[kind])}
              picture={preview === undefined ? null : <SurfaceImage surface={preview} />}
              pressed={kind === chosen}
              onClick={() => onPick(kind)}
            />
          );
        })}
      </div>
    </PickerPanel>
  );
}
