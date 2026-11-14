import { useId } from 'react';
import { t } from '../../../../core/strings/defineStrings.ts';
import {
  ALERT_SOUNDS,
  BRIGHTNESS,
  ICON_SIZES,
  LIST_VISIBLE_ROWS,
  WALLPAPERS,
  type SettingsAction,
  type SettingsPanelState,
} from '../../model/apps/settingsPanel.ts';
import { useDesktopContext } from '../desktopContext.ts';
import { ControlGlyph } from '../glyphs.tsx';
import { ALERT_SOUND_NAMES, ICON_SIZE_NAMES, WALLPAPER_NAMES } from '../labels.ts';
import { strings } from '../strings.ts';
import { ToyTextField } from '../ToyTextField.tsx';

/**
 * One of each common control, for the "Controls" lesson: a checkbox, a radio group, a dropdown,
 * a slider, a text field, and a list that scrolls. The values change the desktop around it.
 */
export function SettingsApp({ windowId, app }: { readonly windowId: string; readonly app: SettingsPanelState }) {
  const { desktop, sayName } = useDesktopContext();
  const { settings } = desktop.state;
  const send = (action: SettingsAction) => desktop.dispatch({ type: 'settings', windowId, action });
  const dropdownId = useId();
  const visible = ALERT_SOUNDS.slice(app.listScroll, app.listScroll + LIST_VISIBLE_ROWS);

  return (
    <div className='td-settings'>
      <label className='td-setting td-setting-inline' data-setting='showNames'>
        <input
          type='checkbox'
          className='td-checkbox'
          checked={settings.showNames}
          onChange={(event) => send({ type: 'set-show-names', value: event.currentTarget.checked })}
        />
        {t(strings.showNames)}
      </label>

      <fieldset className='td-setting' data-setting='wallpaper'>
        <legend className='td-field-label'>{t(strings.background)}</legend>
        <div className='td-radio-row'>
          {WALLPAPERS.map((wallpaper) => (
            <label key={wallpaper} className='td-radio' data-wallpaper-choice={wallpaper}>
              <input
                type='radio'
                name={`${windowId}-wallpaper`}
                checked={settings.wallpaper === wallpaper}
                onChange={() => send({ type: 'set-wallpaper', value: wallpaper })}
              />
              <span className='td-swatch' data-wallpaper={wallpaper} aria-hidden='true' />
              {t(WALLPAPER_NAMES[wallpaper])}
            </label>
          ))}
        </div>
      </fieldset>

      <div className='td-setting' data-setting='iconSize'>
        <span className='td-field-label' id={`${dropdownId}-label`}>
          {t(strings.iconSize)}
        </span>
        <div className='td-dropdown'>
          <button
            type='button'
            className='td-dropdown-button'
            aria-haspopup='true'
            aria-expanded={app.dropdownOpen}
            aria-labelledby={`${dropdownId}-label ${dropdownId}-value`}
            onClick={() => send({ type: app.dropdownOpen ? 'close-dropdown' : 'open-dropdown' })}
          >
            <span id={`${dropdownId}-value`}>{t(ICON_SIZE_NAMES[settings.iconSize])}</span>
            <ControlGlyph glyph={app.dropdownOpen ? 'chevron-up' : 'chevron-down'} />
          </button>
          {app.dropdownOpen && (
            <ul className='td-dropdown-list'>
              {ICON_SIZES.map((size) => (
                <li key={size}>
                  <button
                    type='button'
                    className='td-list-item'
                    data-icon-size-choice={size}
                    aria-pressed={settings.iconSize === size}
                    {...sayName(ICON_SIZE_NAMES[size])}
                    onClick={() => send({ type: 'set-icon-size', value: size })}
                  >
                    {t(ICON_SIZE_NAMES[size])}
                    {settings.iconSize === size && <ControlGlyph glyph='check' />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <label className='td-setting' data-setting='brightness'>
        <span className='td-field-label'>{t(strings.brightness)}</span>
        <input
          type='range'
          className='td-slider'
          min={BRIGHTNESS.min}
          max={BRIGHTNESS.max}
          step={BRIGHTNESS.step}
          value={settings.brightness}
          onChange={(event) => send({ type: 'set-brightness', value: Number(event.currentTarget.value) })}
        />
      </label>

      <label className='td-setting' data-setting='computerName'>
        <span className='td-field-label'>{t(strings.computerName)}</span>
        <ToyTextField
          windowId={windowId}
          field='computer-name'
          editor={app.nameField}
          label={t(strings.computerName)}
          className='td-text-input'
        />
      </label>

      <div className='td-setting' data-setting='alertSound'>
        <span className='td-field-label'>{t(strings.alertSound)}</span>
        <div className='td-scroll-list'>
          <ul
            className='td-scroll-rows'
            aria-label={t(strings.alertSound)}
            onWheel={(event) => send({ type: 'scroll-list', firstRow: app.listScroll + Math.sign(event.deltaY) })}
          >
            {visible.map((sound) => (
              <li key={sound}>
                <button
                  type='button'
                  className='td-list-item'
                  data-alert-sound={sound}
                  aria-pressed={settings.alertSound === sound}
                  {...sayName(ALERT_SOUND_NAMES[sound])}
                  onClick={() => send({ type: 'set-alert-sound', value: sound })}
                >
                  {t(ALERT_SOUND_NAMES[sound])}
                  {settings.alertSound === sound && <ControlGlyph glyph='check' />}
                </button>
              </li>
            ))}
          </ul>
          <div className='td-scroll-buttons'>
            <button
              type='button'
              className='td-tool'
              aria-label={t(strings.scrollUp)}
              data-scroll='up'
              disabled={app.listScroll === 0}
              {...sayName(strings.scrollUp)}
              onClick={() => send({ type: 'scroll-list', firstRow: app.listScroll - 1 })}
            >
              <ControlGlyph glyph='chevron-up' />
            </button>
            <button
              type='button'
              className='td-tool'
              aria-label={t(strings.scrollDown)}
              data-scroll='down'
              disabled={app.listScroll >= ALERT_SOUNDS.length - LIST_VISIBLE_ROWS}
              {...sayName(strings.scrollDown)}
              onClick={() => send({ type: 'scroll-list', firstRow: app.listScroll + 1 })}
            >
              <ControlGlyph glyph='chevron-down' />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
