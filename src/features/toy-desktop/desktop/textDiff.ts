/**
 * The smallest edit that turns one text into another: what changed between the model's text and
 * a text field's value after the browser edited it, such as an input method or a paste the app's
 * clipboard guard put in. The field replays the edit through the model, so its rules and undo
 * still apply.
 */
export interface TextEdit {
  /** The first changed offset in the old text. */
  start: number;
  /** The end of the changed part in the old text. */
  end: number;
  /** What replaces the old text between start and end. */
  insert: string;
}

/** Null when the texts are equal. */
export function textEdit(before: string, after: string): TextEdit | null {
  if (before === after) return null;
  let start = 0;
  const shortest = Math.min(before.length, after.length);
  while (start < shortest && before[start] === after[start]) start += 1;
  let tail = 0;
  while (tail < shortest - start && before[before.length - 1 - tail] === after[after.length - 1 - tail]) tail += 1;
  return { start, end: before.length - tail, insert: after.slice(start, after.length - tail) };
}
