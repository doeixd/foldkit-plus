/**
 * The lifecycle of a piece of content, derived. Nothing stores a status: a state
 * is a pure function of facts (is there a row, can a visitor see it, is there a
 * draft, has the entry been archived) and a clock, so it cannot disagree with
 * them. A scheduled publish that failed reads scheduled and overdue, which is
 * true, and not published, which would not be.
 */

/** What is known of one entry. The server gathers it; nothing here reads a database. */
export interface Facts {
  /** When the entry was archived, if it was. */
  readonly archivedAt: string | null
  /** The content row: none yet, one a visitor can see, or one hidden by its `published` role. */
  readonly row: 'none' | 'visible' | 'hidden'
  /** The entry's working copy, if it has one. */
  readonly draft: {
    readonly scheduledFor: string | null
    readonly scheduleError: string | null
  } | null
}

/** A draft that is to be published at a time, and how that stands. */
export interface Schedule {
  readonly at: string
  /** The time has come and the draft is still a draft: the publish has not run, or failed. */
  readonly overdue: boolean
  /** Why the last attempt failed, for the author to fix. */
  readonly error: string | null
}

export type StateTag = 'New' | 'Published' | 'Changed' | 'Unpublished' | 'Archived'

/**
 * - `New`: nothing published yet.
 * - `Published`: what a visitor sees is all there is.
 * - `Changed`: published, with unpublished work beside it.
 * - `Unpublished`: a row a visitor cannot see.
 * - `Archived`: put away; nothing else applies until it is restored.
 *
 * `schedule` rides beside `New` and `Changed`, the states that have a draft to publish.
 */
export interface State {
  readonly _tag: StateTag
  readonly schedule: Schedule | null
}

/** What an author may ask of an entry. Each is an operation the server runs after asking `allow`. */
export type Transition =
  | 'save'
  | 'discard'
  | 'publish'
  | 'schedule'
  | 'unschedule'
  | 'unpublish'
  | 'archive'
  | 'unarchive'
  | 'restore'

const scheduleOf = (draft: Facts['draft'], now: Date): Schedule | null =>
  draft === null || draft.scheduledFor === null
    ? null
    : {
        at: draft.scheduledFor,
        overdue: new Date(draft.scheduledFor).getTime() <= now.getTime(),
        error: draft.scheduleError,
      }

export const state = (facts: Facts, now: Date): State => {
  if (facts.archivedAt !== null) return { _tag: 'Archived', schedule: null }
  const schedule = scheduleOf(facts.draft, now)
  if (facts.row === 'hidden') return { _tag: 'Unpublished', schedule }
  if (facts.row === 'none') return { _tag: 'New', schedule }
  return facts.draft === null
    ? { _tag: 'Published', schedule: null }
    : { _tag: 'Changed', schedule }
}

/**
 * The transitions a state offers, before anyone asks who is asking. `facts` says
 * whether there is a draft, which a state alone does not: an unpublished entry
 * may or may not have one. `unpublishes` is whether the content type declared a
 * `published` role: without one a row cannot be hidden, so it is not offered.
 */
export const offers = (
  facts: Facts,
  now: Date,
  capabilities: { readonly unpublishes: boolean },
): ReadonlyArray<Transition> => {
  const current = state(facts, now)
  if (current._tag === 'Archived') return ['unarchive']
  const drafted = facts.draft !== null
  return [
    'save',
    ...(drafted ? (['discard', 'publish'] as const) : []),
    ...(drafted && current.schedule === null ? (['schedule'] as const) : []),
    ...(current.schedule !== null ? (['unschedule'] as const) : []),
    ...(facts.row === 'visible' && capabilities.unpublishes ? (['unpublish'] as const) : []),
    ...(facts.row !== 'none' ? (['restore'] as const) : []),
    'archive',
  ]
}
