import { useState } from 'react';
import { Slider } from '../../../components/ui/Slider.tsx';
import type { Band } from '../../../core/bands.ts';
import type { Color } from '../../../core/paint/color.ts';
import type { SpokenHandle } from '../../../core/strings/defineStrings.ts';
import { t } from '../../../core/strings/defineStrings.ts';
import { strings } from '../strings.ts';
import { CheckMark, EmojiPicture } from './controls.tsx';
import { PickerPanel } from './panels.tsx';
import { cssColor, isYoungest, mixedColor, needsDarkMark, paletteFor } from './studioOptions.ts';

function sameColor(a: Color, b: Color): boolean {
  return a.r === b.r && a.g === b.g && a.b === b.b;
}

/**
 * The color swatches. The chosen one carries a check and a thick ring, so color is never the only
 * sign of the choice. Older bands can also mix their own color with two sliders.
 */
export function Palette({
  band,
  color,
  onPick,
}: {
  band: Band;
  color: Color;
  onPick: (color: Color, name?: SpokenHandle) => void;
}) {
  const palette = paletteFor(band);
  const [mixing, setMixing] = useState(false);
  const [hue, setHue] = useState(200);
  const [lightness, setLightness] = useState(50);
  const custom = !palette.some((entry) => sameColor(entry.color, color));
  const mixDisplayColor = custom ? color : mixedColor(hue, lightness);

  const mix = (nextHue: number, nextLightness: number, speak = false): void => {
    setHue(nextHue);
    setLightness(nextLightness);
    onPick(mixedColor(nextHue, nextLightness), speak ? strings.mixColor : undefined);
  };

  return (
    <fieldset className='wk-paint-colors' aria-label={t(strings.colors)}>
      {palette.map((entry) => {
        const chosen = sameColor(entry.color, color);
        return (
          <button
            key={entry.id}
            type='button'
            className='wk-paint-swatch'
            data-color={entry.id}
            data-mark={needsDarkMark(entry.color) ? 'dark' : 'light'}
            aria-label={t(entry.name)}
            aria-pressed={chosen}
            style={{ '--wk-swatch': cssColor(entry.color) }}
            onClick={() => {
              setMixing(false);
              onPick(entry.color, entry.name);
            }}
          >
            {chosen && <CheckMark />}
          </button>
        );
      })}
      {!isYoungest(band) && (
        <button
          type='button'
          className='wk-paint-swatch'
          data-color='mix'
          data-mark={needsDarkMark(mixDisplayColor) ? 'dark' : 'light'}
          aria-label={t(strings.mixColor)}
          aria-pressed={custom}
          aria-expanded={mixing}
          style={{ '--wk-swatch': cssColor(mixDisplayColor) }}
          onClick={() => {
            setMixing((open) => !open);
            if (!custom) mix(hue, lightness, true);
          }}
        >
          {custom ? <CheckMark /> : <EmojiPicture id='paint-palette' />}
        </button>
      )}
      {mixing && (
        <PickerPanel title={t(strings.mixColor)} onClose={() => setMixing(false)} placement='beside'>
          <div className='wk-paint-mixer'>
            <span className='wk-paint-mixer-preview' style={{ '--wk-swatch': cssColor(color) }} aria-hidden='true' />
            <Slider
              label={t(strings.hue)}
              value={hue}
              min={0}
              max={359}
              onValueChange={(value) => mix(value, lightness)}
              valueText={`${hue}°`}
            />
            <Slider
              label={t(strings.lightness)}
              value={lightness}
              min={10}
              max={90}
              onValueChange={(value) => mix(hue, value)}
              valueText={`${lightness}%`}
            />
          </div>
        </PickerPanel>
      )}
    </fieldset>
  );
}
