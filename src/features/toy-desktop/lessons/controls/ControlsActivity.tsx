import { useMemo } from 'react';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { t } from '../../../../core/strings/defineStrings.ts';
import { ControlGlyph } from '../../desktop/glyphs.tsx';
import { ALERT_SOUND_NAMES, ICON_SIZE_NAMES, WALLPAPER_NAMES } from '../../desktop/labels.ts';
import { strings as desktopStrings } from '../../desktop/strings.ts';
import { LessonDesktop, type LessonView } from '../harness/LessonDesktop.tsx';
import { CARD, isMatched, SETTING_OF, type ControlsLevel, type ControlTarget } from './level.ts';
import { controlSteps } from './steps.ts';
import { strings } from './strings.ts';
import './controls.css';

/** The setting's name and the value to choose, drawn the way the panel draws it. */
function TargetRow({ target }: { readonly target: ControlTarget }) {
  switch (target.kind) {
    case 'checkbox':
      return (
        <>
          <span className='ctl-box' data-checked={target.value} aria-hidden='true'>
            {target.value && <ControlGlyph glyph='check' />}
          </span>
          <span className='ctl-text'>
            <span className='ctl-label'>{t(desktopStrings.showNames)}</span>
            <span className='ctl-value'>{t(target.value ? strings.shown : strings.hidden)}</span>
          </span>
        </>
      );
    case 'radio':
      return (
        <>
          <span className='td-swatch ctl-picture' data-wallpaper={target.value} aria-hidden='true' />
          <span className='ctl-text'>
            <span className='ctl-label'>{t(desktopStrings.background)}</span>
            <span className='ctl-value'>{t(WALLPAPER_NAMES[target.value])}</span>
          </span>
        </>
      );
    case 'dropdown':
      return (
        <>
          <span className='ctl-size' data-size={target.value} aria-hidden='true' />
          <span className='ctl-text'>
            <span className='ctl-label'>{t(desktopStrings.iconSize)}</span>
            <span className='ctl-value'>{t(ICON_SIZE_NAMES[target.value])}</span>
          </span>
        </>
      );
    case 'slider':
      return (
        <>
          <span className='ctl-slider' data-at={target.value} aria-hidden='true'>
            <span className='ctl-knob' />
          </span>
          <span className='ctl-text'>
            <span className='ctl-label'>{t(desktopStrings.brightness)}</span>
            <span className='ctl-value'>{t(target.value === 'lowest' ? strings.lowest : strings.middle)}</span>
          </span>
        </>
      );
    case 'text':
      return (
        <span className='ctl-text'>
          <span className='ctl-label'>{t(desktopStrings.computerName)}</span>
          <span className='ctl-value ctl-typed'>{target.value}</span>
        </span>
      );
    // 'list', the last case.
    default:
      return (
        <span className='ctl-text'>
          <span className='ctl-label'>{t(desktopStrings.alertSound)}</span>
          <span className='ctl-value'>{t(ALERT_SOUND_NAMES[target.value])}</span>
        </span>
      );
  }
}

/**
 * The card beside the settings window: every setting to change, the one to do now marked, and a
 * check beside each that already matches. The words repeat what the voice says.
 */
function TargetCard({ targets, view }: { readonly targets: readonly ControlTarget[]; readonly view: LessonView }) {
  const { scale, state, step } = view;
  return (
    <section
      className='ctl-card'
      aria-label={t(strings.card)}
      style={{ left: CARD.x * scale, top: CARD.y * scale, width: CARD.width * scale, maxHeight: CARD.height * scale }}
    >
      <h2 className='ctl-card-title'>{t(strings.card)}</h2>
      <ol className='ctl-list'>
        {targets.map((target, index) => {
          const matched = isMatched(state, target);
          return (
            <li
              key={target.kind}
              className='ctl-row'
              data-target={target.kind}
              data-matched={matched}
              aria-current={index === step ? 'step' : undefined}
            >
              <TargetRow target={target} />
              <span className='ctl-status'>
                {matched && <ControlGlyph glyph='check' className='ctl-check' />}
                <span className='wk-visually-hidden'>{t(matched ? strings.matches : strings.notYet)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Changes the settings panel's controls to match a card that shows each one and a voice that says it. */
export default function ControlsActivity({ level, band, kit }: ActivityProps<ControlsLevel>) {
  const steps = useMemo(() => controlSteps(level), [level]);
  const backdrop = (view: LessonView) => <TargetCard targets={level.targets} view={view} />;
  // The panel shows only the settings on the card, so it fits its window and nothing unrelated
  // competes for attention.
  const uses = level.targets.map((target) => SETTING_OF[target.kind]).join(' ');
  return (
    <div className='ctl-lesson' data-uses={uses}>
      <LessonDesktop level={level} band={band} kit={kit} steps={steps} backdrop={backdrop} />
    </div>
  );
}
