/**
 * Undo and redo, as interaction state kept beside the Document.
 *
 * Snapshots, not inverse Operations: a Document shares structure, so a
 * snapshot costs about what changed, and a snapshot cannot be applied to the
 * wrong Document the way an inverse can. Grouping is explicit and needs no
 * clock: consecutive edits of one prop of one node are one step, so typing a
 * title undoes as a whole. History is bounded, and a new edit after an undo
 * clears redo.
 *
 * Whatever replaces the Document from outside the editor, such as a fill, a
 * reset or a restored revision, clears the History: its snapshots describe a
 * Document that is no longer the one being edited.
 */
import { Schema } from 'effect'
import { Document } from './document.js'
import type { Operation } from './operation.js'

export interface History {
  readonly past: ReadonlyArray<Document>
  readonly future: ReadonlyArray<Document>
  /** The group of the last step, so the next edit of the same group joins it; `null` for none. */
  readonly group: string | null
  readonly limit: number
}

/** A History as a Schema, for a Model that holds one and a draft that stores it. */
const Model = Schema.Struct({
  past: Schema.Array(Document),
  future: Schema.Array(Document),
  // `null`, not `undefined`: a stored History keeps the key through JSON.
  group: Schema.NullOr(Schema.String),
  limit: Schema.Number,
})

export const History = {
  Model,
  /** Nothing to undo, bounded at 200 steps unless told otherwise. */
  empty: (limit = 200): History => ({ past: [], future: [], group: null, limit }),

  /**
   * Records the Document an edit started from. With the same `group` as the
   * last step, the edit joins it and nothing new is recorded.
   */
  commit: (history: History, before: Document, group?: string): History =>
    group !== undefined && group === history.group && history.past.length > 0
      ? { ...history, future: [] }
      : {
          ...history,
          past: [...history.past, before].slice(-history.limit),
          future: [],
          group: group ?? null,
        },

  /** The Document before the last step, or `undefined` when there is none. */
  undo: (
    history: History,
    current: Document,
  ): { readonly history: History; readonly document: Document } | undefined => {
    const previous = history.past.at(-1)
    return previous === undefined
      ? undefined
      : {
          document: previous,
          history: {
            ...history,
            past: history.past.slice(0, -1),
            future: [current, ...history.future],
            group: null,
          },
        }
  },

  /** The Document an undo went back from, or `undefined` when there is none. */
  redo: (
    history: History,
    current: Document,
  ): { readonly history: History; readonly document: Document } | undefined => {
    const [next, ...rest] = history.future
    return next === undefined
      ? undefined
      : {
          document: next,
          history: { ...history, past: [...history.past, current], future: rest, group: null },
        }
  },

  /**
   * The group an Operation joins: consecutive edits of one prop of one node are
   * one step; every other Operation stands alone.
   */
  groupFor: (op: Operation): string | undefined =>
    op._tag === 'SetProp' ? `SetProp:${op.id}:${op.prop}` : undefined,
}
