/**
 * What the Model keeps of live streams, and the events they carry (#378): the
 * shapes the core reads. Applying an event is `liveEvents.ts`'s, which a live
 * read installs.
 */
import type { Schema } from 'effect'
import type { EdgeRef, Edge } from './connection.js'
import { stableStringify } from './query.js'
import type { Requirement } from './requirement.js'
import { entityKey } from './store.js'
import type { QueryRequest } from './wire.js'

export type LiveCursor = number

export type LiveEvent =
  | {
      readonly _tag: 'EntityPatched'
      readonly ref: EdgeRef
      readonly values: Readonly<Record<string, unknown>>
      readonly changed: ReadonlyArray<string>
      readonly cursor: LiveCursor
    }
  | { readonly _tag: 'EntityDeleted'; readonly ref: EdgeRef; readonly cursor: LiveCursor }
  | {
      readonly _tag: 'ConnectionInsert'
      readonly connection: string
      readonly position: 'prepend' | 'append'
      readonly edge: Edge
      readonly cursor: LiveCursor
    }
  | {
      readonly _tag: 'ConnectionRemove'
      readonly connection: string
      readonly edge: Edge
      readonly cursor: LiveCursor
    }
  | {
      readonly _tag: 'ConnectionInvalidate'
      readonly connection: string
      readonly cursor: LiveCursor
    }

export interface BoundaryCounts {
  readonly before: number
  readonly after: number
}

export interface LiveState {
  /** Last applied cursor for this stream. */
  readonly cursor: LiveCursor
  /** Edges recorded outside the loaded boundary, not visible in `items`. */
  readonly boundary: Readonly<Record<string, BoundaryCounts>>
}

export const emptyLiveState: LiveState = { cursor: 0, boundary: {} }

export type LiveOutcome = 'applied' | 'duplicate' | 'gap'

/** What a live stream subscribes to: rows, and lists as their reads send them. */
export interface LiveAsk {
  readonly requirements: ReadonlyArray<Requirement>
  readonly queries: ReadonlyArray<Schema.Schema.Type<typeof QueryRequest>>
}

/** A stable key for a live subscription's rows and lists. */
export const liveStreamKey = ({ requirements, queries }: LiveAsk): string =>
  [
    ...requirements.map(
      requirement =>
        `${entityKey(requirement.entity, requirement.id)}:${[...requirement.fields].sort().join(',')}`,
    ),
    ...queries.map(query => stableStringify(query)),
  ]
    .sort()
    .join('|')
