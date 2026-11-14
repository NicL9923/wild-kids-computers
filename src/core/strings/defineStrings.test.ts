import { describe, expect, it } from 'vitest';
import { defineStrings, t, type SpokenHandle } from './defineStrings.ts';

const speakOnly = (handle: SpokenHandle) => handle.speech;

// Reflect.apply stands in for plain JavaScript, which the union type cannot stop.
const defineUnchecked = () =>
  Reflect.apply(defineStrings, undefined, ['silence', { a: { text: 'x', silent: 'secret' } }]);

describe('defineStrings', () => {
  it('returns a typed handle per key that is spoken by default and says its text', () => {
    const strings = defineStrings('pop-the-seed-pods', {
      instruction: { text: 'Click a seed pod to pop it.' },
      letterB: { text: 'b', speech: 'B.' },
      goal: { text: 'Click a large target that stays still.', silent: 'parent' },
    });

    expect(strings.instruction).toMatchObject({
      id: 'pop-the-seed-pods.instruction',
      kind: 'spoken',
      speech: 'Click a seed pod to pop it.',
    });
    expect(strings.letterB).toMatchObject({ kind: 'spoken', text: 'b', speech: 'B.' });
    expect(strings.goal).toMatchObject({ kind: 'silent', silent: 'parent' });
    expect(t(strings.goal)).toBe('Click a large target that stays still.');
  });

  it('types a silent string so speak-only code cannot take it', () => {
    const strings = defineStrings('typing-demo', {
      spoken: { text: 'Hello.' },
      hidden: { text: 'For grown-ups.', silent: 'parent' },
    });
    expect(speakOnly(strings.spoken)).toBe('Hello.');
    // @ts-expect-error A silent string has no clip, so it is not a SpokenHandle.
    speakOnly(strings.hidden);
  });

  it('freezes the catalog and each handle', () => {
    const strings = defineStrings('frozen', { a: { text: 'A' } });
    expect(Object.isFrozen(strings)).toBe(true);
    expect(Object.isFrozen(strings.a)).toBe(true);
  });

  it.each([
    ['a namespace that is not kebab-case', 'Pop_Seeds', { a: { text: 'x' } }, /must be kebab-case/],
    ['a namespace with a trailing hyphen', 'pop-', { a: { text: 'x' } }, /must be kebab-case/],
    ['no strings', 'empty', {}, /has no strings/],
    ['a key with a space', 'keys', { 'a b': { text: 'x' } }, /keys\.a b: a key uses/],
    ['empty text', 'blank', { a: { text: '' } }, /blank\.a: text is empty/],
    ['whitespace-only text', 'blank', { a: { text: ' \n ' } }, /blank\.a: text is empty/],
    ['a brace placeholder', 'holes', { a: { text: 'Find {letter}.' } }, /no placeholders/],
    ['a template placeholder', 'holes', { a: { text: 'Find ${letter}.' } }, /no placeholders/],
    ['empty speech', 'speech', { a: { text: 'b', speech: ' ' } }, /speech\.a: speech is empty/],
    ['speech on a silent string', 'mixed', { a: { text: 'b', speech: 'bee', silent: 'parent' } }, /has no speech/],
  ] as const)('rejects %s', (_label, namespace, specs, reason) => {
    expect(() => defineStrings(namespace, specs)).toThrow(reason);
  });

  it('rejects a silent reason outside the allowed set', () => {
    expect(defineUnchecked).toThrow(/silent must be one of parent, decorative/);
  });
});
