// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateLevel as controlsLevel } from '../controls/level.ts';
import { controlSteps } from '../controls/steps.ts';
import { generateLevel as copyPasteLevel } from '../copy-and-paste/level.ts';
import { copyPasteSteps } from '../copy-and-paste/steps.ts';
import { generateLevel as menusLevel } from '../menus/level.ts';
import { menuSteps } from '../menus/steps.ts';
import { generateLevel as undoRedoLevel } from '../undo-and-redo/level.ts';
import { undoRedoSteps } from '../undo-and-redo/steps.ts';
import { fakeLessonKit } from './fakeLessonKit.ts';
import { LessonDesktop } from './LessonDesktop.tsx';
import type { LessonLevel, LessonStep } from './lesson.ts';

/** Lessons whose windows have no close button, at a difficulty that uses the menu bar. */
const LESSONS: readonly (readonly [string, LessonLevel, readonly LessonStep[]])[] = [
  ['menus', menusLevel(31, 1, 'band-6-8'), menuSteps(menusLevel(31, 1, 'band-6-8'))],
  ['copy and paste', copyPasteLevel(31, 1, 'band-6-8'), copyPasteSteps(copyPasteLevel(31, 1, 'band-6-8'), 'windows')],
  ['undo and redo', undoRedoLevel(31, 1, 'band-6-8'), undoRedoSteps(undoRedoLevel(31, 1, 'band-6-8'), 'windows')],
];

describe('a lesson whose windows have no close button', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe = () => undefined;
        disconnect = () => undefined;
      },
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each(LESSONS)('keeps every window of %s open through the File menu and the shortcut', (_id, level, steps) => {
    const { container } = render(
      <LessonDesktop level={level} band='band-6-8' kit={fakeLessonKit().kit} steps={steps} />,
    );
    const count = () => container.querySelectorAll('[data-window]').length;
    const before = count();
    expect(before).toBeGreaterThan(0);
    const fileMenu = container.querySelector<HTMLElement>('[data-menu="file"]');
    if (fileMenu === null) throw new Error('the lesson shows no File menu');
    fireEvent.click(fileMenu);
    expect(container.querySelector('[data-command="close"]')).toBeNull();
    const screen = container.querySelector<HTMLElement>('.td-screen');
    if (screen === null) throw new Error('no toy screen');
    fireEvent.keyDown(screen, { key: 'w', ctrlKey: true });
    expect(count()).toBe(before);
  });

  it('gives a window the child opens a close button, so it never stays for good', () => {
    const level = controlsLevel(31, 1, 'band-6-8');
    const { container } = render(
      <LessonDesktop level={level} band='band-6-8' kit={fakeLessonKit().kit} steps={controlSteps(level)} />,
    );
    const icon = container.querySelector<HTMLElement>('[data-desktop-icon="app:notepad"]');
    if (icon === null) throw new Error('no notepad icon');
    fireEvent.click(icon);
    expect(container.querySelector('[data-app="settings"] [data-window-control]')).toBeNull();
    const close = container.querySelector<HTMLElement>('[data-app="notepad"] [data-window-control="close"]');
    if (close === null) throw new Error('the notepad the child opened has no close button');
    fireEvent.click(close);
    expect(container.querySelector('[data-app="notepad"]')).toBeNull();
    expect(container.querySelector('[data-app="settings"]')).not.toBeNull();
  });
});
