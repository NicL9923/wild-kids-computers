import { describe, expect, it } from 'vitest';
import { colors, emojiNames, numbers } from '../../../core/strings/shared/index.ts';
import { DEFINITION_NAMES, TURN_ANGLES, draft as d } from '../engine/program.ts';
import { strings } from '../strings.ts';
import { blockSpeech, hintSpeech, nameSpeech } from './speech.ts';

describe('blockSpeech', () => {
  it('says each block with its value', () => {
    expect(blockSpeech(d.forward(4))).toEqual([strings.forward, numbers[4]]);
    expect(blockSpeech(d.turnLeft(144))).toEqual([strings.turnLeft, strings.angle144]);
    expect(blockSpeech(d.repeat(12, []))).toEqual([strings.repeat, numbers[12]]);
    expect(blockSpeech(d.color('purple'))).toEqual([colors.purple]);
    expect(blockSpeech(d.call('petal'))).toEqual([strings.petal]);
    expect(blockSpeech(d.up())).toEqual([strings.up]);
  });

  it('has a clip for every turn angle and every block name', () => {
    // The shared number clips stop at 100, so each angle needs its own string.
    for (const angle of TURN_ANGLES) expect(blockSpeech(d.turnRight(angle))[1]?.text).toBe(`${String(angle)} degrees`);
    expect(new Set(DEFINITION_NAMES.map(nameSpeech)).size).toBe(DEFINITION_NAMES.length);
    expect(nameSpeech('flower')).toBe(emojiNames.flower);
  });
});

describe('hintSpeech', () => {
  it.each([
    [{ kind: 'step-limit' }, strings.hintStepLimit],
    [{ kind: 'bumped', blockIds: [] }, strings.hintBumped],
    [{ kind: 'not-there-yet', at: { x: 0, y: 0 }, goal: { x: 1, y: 0 } }, strings.hintNotThereYet],
    [{ kind: 'nothing-drawn' }, strings.hintNothingDrawn],
    [{ kind: 'wrong-color', stretches: [] }, strings.hintWrongColor],
    [{ kind: 'missing-line', segments: [] }, strings.hintMissingLine],
    [{ kind: 'extra-line', segments: [] }, strings.hintExtraLine],
    [{ kind: 'wrong-end', at: { x: 0, y: 0 }, goal: { x: 1, y: 0 } }, strings.hintWrongEnd],
  ] as const)('words the %o hint', (hint, handle) => {
    expect(hintSpeech(hint)).toBe(handle);
  });
});
