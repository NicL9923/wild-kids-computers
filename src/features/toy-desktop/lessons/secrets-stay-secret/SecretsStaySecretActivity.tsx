import { useRef, useState } from 'react';
import { useCarry } from '../../../../activityShell/carry/useCarry.ts';
import type { ActivityProps } from '../../../../activityShell/kit.ts';
import { Emoji } from '../../../../components/ui/Emoji.tsx';
import { t, type SpokenHandle } from '../../../../core/strings/defineStrings.ts';
import { feedback } from '../../../../core/strings/shared/index.ts';
import { binOf, FACTS, strengthOf, type Bin, type FactId, type SecretsLevel, type Strength } from './level.ts';
import { strings } from './strings.ts';
import './secretsStaySecret.css';

/** Wrong tries with one card before its box lights up. */
const TRIES_BEFORE_HINT = 2;

/** The pause after the last card, so the child sees it land. */
const DONE_PAUSE_MS = 1200;

const FACT_NAMES: Readonly<Record<FactId, SpokenHandle>> = {
  'home-address': strings.homeAddress,
  'full-name-birthday': strings.fullNameBirthday,
  'phone-number': strings.phoneNumber,
  'your-password': strings.yourPassword,
  'favorite-color': strings.favoriteColor,
  'favorite-animal': strings.favoriteAnimal,
  'favorite-food': strings.favoriteFood,
  'favorite-song': strings.favoriteSong,
};

const STRENGTH_WORDS: Readonly<Record<Exclude<Strength, 'empty'>, SpokenHandle>> = {
  weak: strings.weak,
  okay: strings.okay,
  strong: strings.strong,
};

/** Filled bars on the meter: a shape as well as a color, so color is never the only sign. */
const STRENGTH_BARS: Readonly<Record<Strength, number>> = { empty: 0, weak: 1, okay: 2, strong: 3 };

/**
 * Two parts with one goal, keeping private things private. First the child builds a pretend
 * password from pieces and watches it grow stronger with length and a mix of kinds. Nothing is
 * typed, so no real password can land here, and nothing is saved. Then the child sorts fact cards
 * into a locked box for private things and an open box for things that are fine to share.
 */
export default function SecretsStaySecretActivity({ level, band, kit }: ActivityProps<SecretsLevel>) {
  const [used, setUsed] = useState<readonly string[]>([]);
  const [phase, setPhase] = useState<'password' | 'sort'>('password');
  const [sorted, setSorted] = useState<ReadonlyMap<FactId, Bin>>(new Map());
  const [lit, setLit] = useState<Bin | null>(null);
  const tries = useRef(new Map<FactId, number>());
  const bins = useRef(new Map<Bin, HTMLElement>());

  const password = used.map((id) => level.pieces.find((piece) => piece.id === id)?.text ?? '').join('');
  const strength = strengthOf(password);
  const talkative = band !== 'band-9-12';
  const sayName = (handle: SpokenHandle) =>
    talkative ? { onPointerEnter: () => void kit.speak(handle), onFocus: () => void kit.speak(handle) } : {};

  function change(next: readonly string[]): void {
    const before = strengthOf(password);
    const text = next.map((id) => level.pieces.find((piece) => piece.id === id)?.text ?? '').join('');
    const after = strengthOf(text);
    setUsed(next);
    if (after === 'empty' || after === before) return;
    if (after !== 'strong') {
      void kit.speak(STRENGTH_WORDS[after]);
      return;
    }
    kit.feedback.correct({ say: strings.strong });
    setPhase('sort');
    kit.scope.setTimeout(() => kit.setInstruction(strings.sort), DONE_PAUSE_MS);
  }

  const carry = useCarry<FactId, Bin>(kit, {
    kind: 'targets',
    onDrop(fact, bin) {
      const element = bins.current.get(bin);
      if (binOf(fact) === bin) {
        const next = new Map(sorted).set(fact, bin);
        setSorted(next);
        setLit(null);
        kit.feedback.correct({ at: element, silent: true });
        if (next.size === level.facts.length) {
          kit.feedback.correct({ say: feedback.youDidIt });
          kit.scope.setTimeout(() => kit.roundComplete(), DONE_PAUSE_MS);
        }
        return;
      }
      kit.feedback.wrong({ at: element, say: binOf(fact) === 'private' ? strings.isPrivate : strings.isFine });
      const count = (tries.current.get(fact) ?? 0) + 1;
      tries.current.set(fact, count);
      if (count === TRIES_BEFORE_HINT) {
        setLit(binOf(fact));
        kit.hint(feedback.hereItIs);
      }
    },
  });

  return (
    <div className='sss-stage' data-phase={phase}>
      <section className='sss-builder' aria-label={t(strings.password)}>
        <div className='sss-password-row'>
          <Emoji id='lock' decorative className='sss-lock' />
          <output className='sss-password' data-length={password.length}>
            {password === '' ? ' ' : password}
          </output>
          {phase === 'password' && (
            <button
              type='button'
              className='sss-take-off'
              aria-label={t(strings.takeOff)}
              disabled={used.length === 0}
              {...sayName(strings.takeOff)}
              onClick={() => change(used.slice(0, -1))}
            >
              <svg className='sss-take-off-glyph' viewBox='0 0 24 24' aria-hidden='true'>
                <path d='M9 5 H20 V19 H9 L3 12 Z M12 9 L17 15 M17 9 L12 15' />
              </svg>
            </button>
          )}
        </div>
        <div className='sss-meter' data-strength={strength}>
          <meter
            className='wk-visually-hidden'
            min={0}
            max={3}
            value={STRENGTH_BARS[strength]}
            aria-label={t(strings.strength)}
          />
          <span className='sss-bars' aria-hidden='true'>
            {[1, 2, 3].map((bar) => (
              <span key={bar} className='sss-bar' data-on={STRENGTH_BARS[strength] >= bar} />
            ))}
          </span>
          <span className='sss-strength-word'>
            {t(strength === 'empty' ? strings.empty : STRENGTH_WORDS[strength])}
          </span>
        </div>
        {phase === 'password' && (
          <ul className='sss-pieces' aria-label={t(strings.pieces)}>
            {level.pieces.map((piece) => (
              <li key={piece.id}>
                <button
                  type='button'
                  className='sss-piece'
                  data-piece={piece.id}
                  disabled={used.includes(piece.id)}
                  onClick={() => change([...used, piece.id])}
                >
                  {piece.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {phase === 'sort' && (
        <section className='sss-sorter' aria-label={t(strings.cards)}>
          <ul className='sss-cards'>
            {level.facts
              .filter((fact) => !sorted.has(fact))
              .map((fact) => {
                const emoji = FACTS.find((each) => each.id === fact)?.emoji ?? 'page';
                return (
                  <li key={fact}>
                    <button
                      type='button'
                      {...carry.item(fact)}
                      className='sss-card'
                      data-fact={fact}
                      aria-label={t(FACT_NAMES[fact])}
                      {...sayName(FACT_NAMES[fact])}
                    >
                      <Emoji id={emoji} decorative className='sss-card-picture' />
                      <span className='sss-card-text' aria-hidden='true'>
                        {t(FACT_NAMES[fact])}
                      </span>
                    </button>
                  </li>
                );
              })}
          </ul>
          <div className='sss-bins'>
            {(['private', 'share'] as const).map((bin) => {
              const target = carry.target(bin);
              const name = bin === 'private' ? strings.keepPrivate : strings.fineToShare;
              const inside = level.facts.filter((fact) => sorted.get(fact) === bin);
              return (
                <div
                  key={bin}
                  {...target}
                  ref={(element) => {
                    target.ref(element);
                    if (element === null) bins.current.delete(bin);
                    else bins.current.set(bin, element);
                  }}
                  className='sss-bin'
                  data-bin={bin}
                  data-hint={lit === bin}
                  {...sayName(name)}
                >
                  <Emoji id={bin === 'private' ? 'lock' : 'open-lock'} decorative className='sss-bin-picture' />
                  <span className='sss-bin-name'>{t(name)}</span>
                  <ul className='sss-bin-load' aria-label={t(name)}>
                    {inside.map((fact) => (
                      <li key={fact}>
                        <Emoji
                          id={FACTS.find((each) => each.id === fact)?.emoji ?? 'page'}
                          decorative
                          className='sss-load-picture'
                        />
                        <span className='wk-visually-hidden'>{t(FACT_NAMES[fact])}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
