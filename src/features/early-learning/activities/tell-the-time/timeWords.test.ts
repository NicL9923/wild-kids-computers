import { describe, expect, it } from 'vitest';
import { numberHandle } from '../../../../core/strings/shared/index.ts';
import { strings } from './strings.ts';
import { sayTime } from './timeWords.ts';

describe('sayTime', () => {
  it.each([
    ['3:00', { hour: 3, minute: 0 }, [numberHandle(3), strings.oclock]],
    ['3:30', { hour: 3, minute: 30 }, [strings.halfPast, numberHandle(3)]],
    ['3:15', { hour: 3, minute: 15 }, [strings.quarterPast, numberHandle(3)]],
    ['3:45', { hour: 3, minute: 45 }, [strings.quarterTo, numberHandle(4)]],
    // Quarter to the hour after twelve is one, not thirteen.
    ['12:45', { hour: 12, minute: 45 }, [strings.quarterTo, numberHandle(1)]],
    ['3:05', { hour: 3, minute: 5 }, [numberHandle(3), strings.oh, numberHandle(5)]],
    ['3:10', { hour: 3, minute: 10 }, [numberHandle(3), numberHandle(10)]],
    ['11:55', { hour: 11, minute: 55 }, [numberHandle(11), numberHandle(55)]],
  ])('says %s the way a person does', (_, time, words) => {
    expect(sayTime(time)).toEqual(words);
  });
});
