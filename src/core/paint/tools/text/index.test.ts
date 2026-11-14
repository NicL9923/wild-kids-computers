import { describe, expect, it } from 'vitest';
import { startStroke } from '../../session.ts';
import { drawStroke, expectGolden, loadFont, newPicture, ORANGE, testSettings } from '../../testing/golden.ts';
import text from './index.ts';

const font = loadFont();

describe('text tool', () => {
  it('writes letters with single-story a and g, punctuation, and a second line', () => {
    const { doc, history } = newPicture();
    drawStroke(history, text, testSettings({ size: 22, text: { content: 'Wild Kids!', font } }), [{ x: 8, y: 22 }]);
    drawStroke(
      history,
      text,
      testSettings({ size: 12, color: ORANGE, text: { content: 'a big dog, 123?\nAVA ToT', font } }),
      [{ x: 8, y: 62 }],
    );
    expectGolden('tool-text', doc.paint);
  });

  it('follows the pointer and leaves only the text at the last point', () => {
    const moved = newPicture();
    drawStroke(moved.history, text, testSettings({ size: 16, text: { content: 'Hi', font } }), [
      { x: 10, y: 20 },
      { x: 100, y: 90 },
    ]);
    const direct = newPicture();
    drawStroke(direct.history, text, testSettings({ size: 16, text: { content: 'Hi', font } }), [{ x: 100, y: 90 }]);
    expect(moved.doc.paint.data).toEqual(direct.doc.paint.data);
  });

  it('draws a character the font lacks as a question mark', () => {
    const missing = newPicture();
    drawStroke(missing.history, text, testSettings({ size: 16, text: { content: 'b\u{1F98A}', font } }), [
      { x: 10, y: 60 },
    ]);
    const question = newPicture();
    drawStroke(question.history, text, testSettings({ size: 16, text: { content: 'b?', font } }), [{ x: 10, y: 60 }]);
    expect(missing.doc.paint.data).toEqual(question.doc.paint.data);
  });

  it('changes nothing without text', () => {
    const { history } = newPicture();
    const stroke = startStroke(history, text, testSettings({ text: { content: '', font } }));
    expect(stroke.begin({ x: 10, y: 10 }).width).toBe(0);
    stroke.end();
    expect(history.canUndo).toBe(false);
  });
});
