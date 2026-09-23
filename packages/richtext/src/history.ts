import type { Command } from './command.js'
import type { EditorState } from './document.js'

/**
 * Local undo history over editor snapshots. Snapshots are `EditorState` values
 * (document plus selection), so undo restores what the user saw, including the
 * caret. History is interaction state: it belongs in the application Model
 * beside the selection, never in published content, and collaborative undo is a
 * different operation (§§65–66).
 */
export interface History {
  /** States to return to, oldest first. */
  readonly past: ReadonlyArray<EditorState>
  /** States undone from, nearest first. */
  readonly future: ReadonlyArray<EditorState>
  /** The group the last commit joined, if any. */
  readonly group?: string | undefined
}

export const emptyHistory: History = Object.freeze({ past: [], future: [] })

export interface CommitOptions {
  /**
   * Joins the previous step when it used the same group. Consecutive typing
   * shares one undo step; omit the group and every commit stands alone.
   */
  readonly group?: string
  /** Most steps to keep; the oldest is dropped beyond this. Default 200. */
  readonly capacity?: number
}

/**
 * Typing continues one undo step; every other command is its own step. Callers
 * pass this to `commit`, so grouping policy lives with the editor vocabulary
 * rather than being reinvented per adapter.
 */
export const groupFor = (command: Command): string | undefined =>
  command.type === 'InsertText' ||
  command.type === 'DeleteBackward' ||
  command.type === 'DeleteForward'
    ? 'typing'
    : undefined

const bounded = (past: ReadonlyArray<EditorState>, capacity: number): ReadonlyArray<EditorState> =>
  past.length > capacity ? past.slice(past.length - capacity) : past

/**
 * Records a committed transition. `previous` is the state before the command
 * and `next` the state after it; only `previous` is stored, because the caller
 * already holds `next`.
 */
export const commit = (
  history: History,
  previous: EditorState,
  options: CommitOptions = {},
): History => {
  const joins = options.group !== undefined && history.group === options.group
  const past = joins ? history.past : bounded([...history.past, previous], options.capacity ?? 200)
  return options.group === undefined
    ? { past, future: [] }
    : { past, future: [], group: options.group }
}

export interface Restore {
  readonly history: History
  readonly state: EditorState
}

/** Steps back one group. Returns undefined when there is nothing to undo. */
export const undo = (history: History, current: EditorState): Restore | undefined => {
  const previous = history.past[history.past.length - 1]
  if (previous === undefined) return undefined
  return {
    history: { past: history.past.slice(0, -1), future: [current, ...history.future] },
    state: previous,
  }
}

/** Steps forward again. Returns undefined when there is nothing to redo. */
export const redo = (history: History, current: EditorState): Restore | undefined => {
  const next = history.future[0]
  if (next === undefined) return undefined
  return {
    history: {
      past: [...history.past, current],
      future: history.future.slice(1),
      group: history.group,
    },
    state: next,
  }
}

export const canUndo = (history: History): boolean => history.past.length > 0
export const canRedo = (history: History): boolean => history.future.length > 0

/** Structural summary for tooling and tests. */
export const inspectHistory = (history: History) => ({
  past: history.past.length,
  future: history.future.length,
  group: history.group ?? null,
})
