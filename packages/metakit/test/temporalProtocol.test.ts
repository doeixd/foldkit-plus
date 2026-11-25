import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import * as Temporal from '../src/temporal.js'

interface UndoState {
  readonly items: ReadonlyArray<string>
  readonly undoBuffer: string | null
  readonly restored: boolean
}

const initial: UndoState = {
  items: [],
  undoBuffer: 'deleted-todo',
  restored: false,
}

const UndoProtocol = Temporal.protocol(['expire-vs-restore'] as const)

const expireVsRestore = UndoProtocol.obligation({
  name: 'expire-vs-restore',
  over: ['ExpireUndo', 'Restore'] as const,
  shows: 'ExpireUndo and Restore racing never both lose the item and mark it restored',
})

describe('Temporal.protocol (Phase 9 Bout 9.5)', () => {
  it('reports open obligations before discharge, holds when guarded, and breaks with a seed when unguarded', () => {
    // Open while undischarged.
    expect(Temporal.undischarged([expireVsRestore], [])).toHaveLength(1)

    // Guarded: Restore only restores when undoBuffer is still present.
    const guardedDischarge = UndoProtocol.discharge(
      expireVsRestore,
      {
        initial: () => initial,
        steps: [
          {
            name: 'expire',
            of: 'ExpireUndo',
            run: s => ({ ...s, undoBuffer: null }),
          },
          {
            name: 'restore',
            of: 'Restore',
            run: s =>
              s.undoBuffer === null
                ? s
                : { items: [...s.items, s.undoBuffer], undoBuffer: null, restored: true },
          },
        ],
        holds: s =>
          !s.restored || s.items.length === 1
            ? Option.none()
            : Option.some('restored without item'),
      },
      { seed: 7, runs: 20 },
    )
    expect(Temporal.WalkResult.$is('Held')(guardedDischarge.result)).toBe(true)
    expect(Temporal.undischarged([expireVsRestore], [guardedDischarge])).toEqual([])

    // Removing the guard breaks the invariant with a reproducible seed.
    const unguardedDischarge = UndoProtocol.discharge(
      expireVsRestore,
      {
        initial: () => initial,
        steps: [
          {
            name: 'expire',
            of: 'ExpireUndo',
            run: s => ({ ...s, undoBuffer: null }),
          },
          {
            name: 'restore',
            of: 'Restore',
            run: s => ({
              items: s.undoBuffer === null ? s.items : [...s.items, s.undoBuffer],
              undoBuffer: null,
              restored: true,
            }),
          },
        ],
        holds: s =>
          !s.restored || s.items.length === 1
            ? Option.none()
            : Option.some('restored without item'),
      },
      { seed: 7, runs: 20 },
    )
    expect(Temporal.WalkResult.$is('Broken')(unguardedDischarge.result)).toBe(true)
    expect(Temporal.undischarged([expireVsRestore], [unguardedDischarge])).toHaveLength(1)
  })
})
