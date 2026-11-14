import { describe, expect, it } from 'vitest';
import { createManualScheduler } from '../../../core/activityKit/scheduler.ts';
import { createScope } from '../../../core/activityKit/scope.ts';
import { TrashUndo } from './trashUndo.ts';

const UNDO_MS = 12_000;

function setup() {
  const scheduler = createManualScheduler({ wall: 0 });
  const scope = createScope(scheduler);
  const purged: string[] = [];
  const shown: (string | null)[] = [];
  const undo = new TrashUndo({
    scope,
    undoMs: UNDO_MS,
    purge: (id) => {
      purged.push(id);
    },
    onChange: (id) => shown.push(id),
  });
  return { scheduler, scope, undo, purged, shown };
}

describe('the trash undo control', () => {
  it('purges a trashed picture when its undo control times out, not before', () => {
    const { scheduler, undo, purged, shown } = setup();
    undo.trashed('pic-1');
    scheduler.advance(UNDO_MS - 1);
    expect(purged).toEqual([]);
    scheduler.advance(1);
    expect(purged).toEqual(['pic-1']);
    expect(shown).toEqual(['pic-1', null]);
  });

  it('never purges a picture that was brought back', () => {
    const { scheduler, undo, purged, shown } = setup();
    undo.trashed('pic-1');
    expect(undo.bringBack()).toBe('pic-1');
    scheduler.advance(UNDO_MS * 2);
    undo.close();
    expect(purged).toEqual([]);
    expect(shown).toEqual(['pic-1', null]);
  });

  it('purges the earlier picture when another one takes over the undo control', () => {
    const { scheduler, undo, purged } = setup();
    undo.trashed('pic-1');
    scheduler.advance(1000);
    undo.trashed('pic-2');
    expect(purged).toEqual(['pic-1']);
    // The second picture gets the full time from its own trashing.
    scheduler.advance(UNDO_MS - 1);
    expect(purged).toEqual(['pic-1']);
    scheduler.advance(1);
    expect(purged).toEqual(['pic-1', 'pic-2']);
  });

  it('purges the waiting picture when the gallery closes, once', () => {
    const { scheduler, scope, undo, purged } = setup();
    undo.trashed('pic-1');
    undo.close();
    scope.dispose();
    scheduler.advance(UNDO_MS);
    undo.close();
    expect(purged).toEqual(['pic-1']);
  });

  it('has nothing to bring back when nothing waits', () => {
    const { undo, purged } = setup();
    expect(undo.bringBack()).toBeNull();
    undo.close();
    expect(purged).toEqual([]);
  });
});
