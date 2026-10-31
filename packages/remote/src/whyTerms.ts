/**
 * Why a read shows what it shows: every fact the Model holds about what the
 * read reads, by typed reference rather than by the store's marks (#248).
 */
import { Option, Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'
import { RemoteData, remoteErrorSchema, type RemoteError } from './remoteData.js'

const RowRef = Schema.Struct({ entity: Schema.String, id: Schema.String })
/** A list by its query's name and its connection identity (the query and its encoded input). */
const ListRef = Schema.Struct({ query: Schema.String, identity: Schema.String })
export type ListRef = typeof ListRef.Type
/**
 * `Missing`: the store does not hold it. `Evicted`: it does not, because the
 * budget evicted it from a Surface left. `Stale`: it holds it, marked out of date.
 */
const Held = Schema.Literals(['Missing', 'Evicted', 'Stale'])
const Names = Schema.Array(Schema.String)

/** What shows something the server has not said: a write, an overlay, or a live event. */
export const ShownBy = defineTaggedUnion({
  /** `Data.mutate`'s request; the mutation is none once the ledger no longer holds its write. */
  Write: { requestId: Schema.String, mutation: Schema.OptionFromNullOr(Schema.String) },
  /** `Data.overlay`'s id. */
  Overlay: { id: Schema.String },
  /** A live event's insert or remove, by its cursor. */
  Live: { cursor: Schema.String },
})
export type ShownBy = typeof ShownBy.Type

/**
 * One `where` predicate of a list's body, judged over the row as the client
 * placed it. `Null` is SQL's unknown, which keeps a row out; `Unknown` rests
 * on what the store lacks, and `reason` says what.
 */
export const WhyTerm = Schema.Struct({
  term: Schema.String,
  truth: Schema.Literals(['True', 'False', 'Null', 'Unknown']),
  reason: Schema.OptionFromNullOr(Schema.String),
})
export type WhyTerm = typeof WhyTerm.Type

/** One fact about a read. `ReadWhy.because` lists every one the Model holds. */
export const Why = defineTaggedUnion({
  /** `Initial`, and no active Surface asks for all of the read. */
  NotObserved: {},
  /** `Initial`, and these active Surfaces read it: Remote's Subscriptions are not running. */
  NotFetching: { surfaces: Names },
  /** `Initial`, and no active record was given to tell which mistake it is. */
  NoActiveRecord: {},
  /** The list's own page is missing or stale; `inFlight` while its query is out. */
  List: { list: ListRef, held: Held, inFlight: Schema.Boolean },
  /** Fields of one row are missing or stale; `via` is the relation path from the read's row. */
  Fields: { row: RowRef, via: Names, fields: Names, held: Held, inFlight: Schema.Boolean },
  /** The list's query failed, and nothing has settled it. Nothing retries it on its own. */
  ListFailed: { list: ListRef, error: remoteErrorSchema },
  /** Reading these fields failed, and nothing has settled it. Nothing retries it on its own. */
  FieldsFailed: { row: RowRef, via: Names, fields: Names, error: remoteErrorSchema },
  /** The server settled these fields without a value for this principal. */
  Unavailable: { row: RowRef, via: Names, fields: Names },
  /** What the store holds does not decode against the Selection. */
  Undecodable: { message: Schema.String },
  /** The row is shown only by an overlay, which lacks fields nothing will fetch. */
  OverlayOnly: { message: Schema.String },
  /** The row is gone: the server said so (`by` none), or a pending write deletes it. */
  Deleted: { row: RowRef, by: Schema.OptionFromNullOr(ShownBy) },
  /** A live stream of a Surface reading it broke; the live entry resubscribes on its own. */
  LiveReconnecting: {
    surface: Schema.String,
    attempt: Schema.Number,
    error: Schema.OptionFromNullOr(remoteErrorSchema),
  },
  /** The server refused a Surface's live stream; nothing asks again until what it reads changes. */
  LiveRefused: { surface: Schema.String, error: remoteErrorSchema },
  /** A pending layer writes these fields of a row the read shows. */
  Pending: { row: RowRef, fields: Names, by: ShownBy },
  /** The list shows a row its server pages do not hold. */
  Joined: {
    list: ListRef,
    row: RowRef,
    by: Schema.OptionFromNullOr(ShownBy),
    terms: Schema.Array(WhyTerm),
  },
  /** The list's server pages hold a row it does not show. */
  Left: {
    list: ListRef,
    row: RowRef,
    by: Schema.OptionFromNullOr(ShownBy),
    terms: Schema.Array(WhyTerm),
  },
})
export type Why = typeof Why.Type

const State = Schema.Literals(['Initial', 'Loading', 'Ready', 'Refreshing', 'Failed', 'NotFound'])
type State = typeof State.Type

/**
 * Why a read shows what it shows. `because` is every fact the Model holds
 * about what it reads, the reason that decides `state` first; `message` is
 * that reason in words. `surfaces` are the active Surfaces reading all of it,
 * when the active record was given. Encode it with this schema for JSON.
 */
export const ReadWhy = Schema.Struct({
  state: State,
  because: Schema.Array(Why),
  message: Schema.String,
  surfaces: Schema.OptionFromNullOr(Names),
})
export type ReadWhy = typeof ReadWhy.Type

/** Remote's own failures say what to do; a server's error says itself. */
const failedReadWords = (error: RemoteError): string => {
  // tag-check: open — a server names its own errors; only these three are Remote's.
  switch (error._tag) {
    case 'DecodeError':
      return `What the server sent does not decode against the Selection: ${error.message}`
    case 'Unavailable':
      return `${error.message} Select without it, or Data.refresh asks again.`
    case 'Overlaid':
      return `${error.message} Overlay every field the Selection reads, or select fewer.`
    default:
      return `Its request failed: ${error.message}. Nothing retries a failed read on its own; Data.refresh asks again.`
  }
}

const rowWords = (row: typeof RowRef.Type, via: ReadonlyArray<string>): string =>
  `${row.entity} ${row.id}${via.length === 0 ? '' : ` (through ${via.join('.')})`}`

const sourceWords = (source: ShownBy): string =>
  ShownBy.match(source, {
    Write: ({ requestId, mutation }) =>
      Option.match(mutation, {
        onNone: () => `request ${requestId}`,
        onSome: name => `${name} (request ${requestId})`,
      }),
    Overlay: ({ id }) => `overlay "${id}"`,
    Live: () => 'a live event',
  })

const termWords = (terms: ReadonlyArray<WhyTerm>): string =>
  terms.length === 0
    ? ''
    : ` Its terms: ${terms.map(term => `${term.term} is ${term.truth}`).join(', ')}.`

const heldWords: Readonly<
  Record<typeof Held.Type, Readonly<Record<'true' | 'false', (what: string) => string>>>
> = {
  Missing: {
    true: what => `${what} is being fetched.`,
    false: what => `${what} is not held, and nothing is fetching it.`,
  },
  Evicted: {
    true: what =>
      `${what} was evicted to keep the cache within its budget (Remote.make's budget), and is being fetched again.`,
    false: what =>
      `${what} was evicted to keep the cache within its budget (Remote.make's budget); the read entry fetches it again while a Surface reads it.`,
  },
  Stale: {
    true: what => `${what} is shown while a newer value is fetched.`,
    false: what =>
      `${what} is out of date; the read entry fetches it again while a Surface reads it.`,
  },
}

/** One reason in words, with what restarts it. */
export const whyWords = (why: Why): string =>
  Why.match(why, {
    NotObserved: () =>
      'No active Surface reads it, so nothing fetches it. Include it in a Surface that is active for this Model, in the record given to Data.subscriptions.',
    NotFetching: ({ surfaces }) =>
      `${surfaces.join(', ')} ${surfaces.length === 1 ? 'reads it and is' : 'read it and are'} active, yet nothing is fetching it. Right after a Message, that is the moment before the read entry asks; if it stays so, Remote's Subscriptions are not installed: give the runtime Data.subscriptions (or Data.wiring) and a RemoteClient.`,
    NoActiveRecord: () =>
      'Nothing is fetching it. Pass the active record you give Data.subscriptions as `surfaces` to tell whether an active Surface reads it.',
    List: ({ list, held, inFlight }) => heldWords[held][`${inFlight}`](`Its list "${list.query}"`),
    Fields: ({ row, via, fields, held, inFlight }) =>
      heldWords[held][`${inFlight}`](`${fields.join(', ')} of ${rowWords(row, via)}`),
    ListFailed: ({ list, error }) => `Its list "${list.query}" failed. ${failedReadWords(error)}`,
    FieldsFailed: ({ row, via, fields, error }) =>
      `Reading ${fields.join(', ')} of ${rowWords(row, via)} failed. ${failedReadWords(error)}`,
    Unavailable: ({ row, via, fields }) =>
      `The server settled ${fields.join(', ')} of ${rowWords(row, via)} without a value for this principal. Select without them, or Data.refresh asks again.`,
    Undecodable: ({ message }) =>
      `What the store holds does not decode against the Selection: ${message}`,
    OverlayOnly: ({ message }) =>
      `${message} Overlay every field the Selection reads, or select fewer.`,
    Deleted: ({ row, by }) =>
      Option.match(by, {
        onNone: () =>
          `The server answered without ${rowWords(row, [])}: it does not exist, or this principal may not see it.`,
        onSome: source =>
          `${sourceWords(source)} deletes ${rowWords(row, [])}; its answer settles it, and its failure brings the row back.`,
      }),
    LiveReconnecting: ({ surface, attempt }) =>
      `${surface}'s live stream broke (attempt ${attempt}); the live entry resubscribes on its own, with backoff, and what changes meanwhile is fetched again.`,
    LiveRefused: ({ surface, error }) =>
      `The server refused ${surface}'s live stream: ${error.message}. Nothing asks again until what it reads changes.`,
    Pending: ({ row, fields, by }) =>
      `${fields.join(', ')} of ${rowWords(row, [])} show what ${sourceWords(by)} wrote, until it is answered.`,
    Joined: ({ list, row, by, terms }) =>
      `${rowWords(row, [])} shows in "${list.query}" before the server lists it${Option.match(by, { onNone: () => '', onSome: source => `, for ${sourceWords(source)}` })}.${termWords(terms)}`,
    Left: ({ list, row, by, terms }) =>
      `${rowWords(row, [])} is left out of "${list.query}", which the server still lists it in${Option.match(by, { onNone: () => '', onSome: source => `, for ${sourceWords(source)}` })}.${termWords(terms)}`,
  })

type Decided = Readonly<
  Record<typeof Held.Type, Readonly<Record<'true' | 'false', ReadonlyArray<State>>>>
>

/** A list's own page: missing reads `Loading` while fetched, `Initial` otherwise. */
const listDecides: Decided = {
  Missing: { true: ['Loading'], false: ['Initial'] },
  Evicted: { true: ['Loading'], false: ['Initial'] },
  Stale: { true: ['Refreshing'], false: ['Refreshing'] },
}

/**
 * A row's fields: an entity read missing them reads `Loading` or `Initial`;
 * a list leaves the row out and reads `Refreshing`.
 */
const fieldsDecide: Decided = {
  Missing: { true: ['Loading', 'Refreshing'], false: ['Initial', 'Refreshing'] },
  Evicted: { true: ['Loading', 'Refreshing'], false: ['Initial', 'Refreshing'] },
  Stale: { true: ['Refreshing'], false: ['Refreshing'] },
}

/** The states each reason can decide: the one `message` speaks of is the first that decides `state`. */
const decides = (why: Why): ReadonlyArray<State> =>
  Why.match<ReadonlyArray<State>>(why, {
    NotObserved: () => ['Initial'],
    NotFetching: () => ['Initial'],
    NoActiveRecord: () => ['Initial'],
    List: ({ held, inFlight }) => listDecides[held][`${inFlight}`],
    Fields: ({ held, inFlight }) => fieldsDecide[held][`${inFlight}`],
    ListFailed: () => ['Failed'],
    FieldsFailed: () => ['Failed'],
    Unavailable: () => ['Failed'],
    Undecodable: () => ['Failed'],
    OverlayOnly: () => ['Failed'],
    Deleted: () => ['NotFound'],
    LiveReconnecting: () => [],
    LiveRefused: () => [],
    Pending: () => ['Ready', 'Refreshing'],
    Joined: () => ['Ready', 'Refreshing'],
    Left: () => ['Ready', 'Refreshing'],
  })

const stateWords: Readonly<Record<State, string>> = {
  Initial: 'Nothing is fetching it.',
  Loading: 'A request for it is in flight.',
  Ready: 'Everything it selects is here.',
  Refreshing: 'It is shown while a newer value is fetched.',
  Failed: 'It failed.',
  NotFound: 'The server answered without it: it does not exist, or this principal may not see it.',
}

/** The explanation of a read in `state`, from its reasons. */
export const readWhy = (
  state: State,
  because: ReadonlyArray<Why>,
  surfaces: Option.Option<ReadonlyArray<string>>,
): ReadWhy => {
  const decisive = because.findIndex(why => decides(why).includes(state))
  const ordered =
    decisive <= 0 ? because : [because[decisive]!, ...because.filter((_, at) => at !== decisive)]
  return {
    state,
    because: ordered,
    message: decisive === -1 ? stateWords[state] : whyWords(because[decisive]!),
    surfaces,
  }
}

/** Whether a read shows a value. */
const shows = (data: RemoteData<unknown>): boolean =>
  RemoteData.match(data, {
    Initial: () => false,
    Loading: () => false,
    Ready: () => true,
    Refreshing: () => true,
    Failed: () => false,
    NotFound: () => false,
  })

/** Whether a read that showed a value still does, or says why not: failed with it, or found it gone. */
const keeps = (data: RemoteData<unknown>): boolean =>
  RemoteData.match(data, {
    Initial: () => false,
    Loading: () => false,
    Ready: () => true,
    Refreshing: () => true,
    Failed: (_, previous) => Option.isSome(previous),
    NotFound: () => true,
  })

/**
 * #234's rule: a read that showed a value stopped showing it with no reason
 * a reader can see (`Loading`, `Initial`, or `Failed` without the value).
 */
export const regressed = (from: RemoteData<unknown>, to: RemoteData<unknown>): boolean =>
  shows(from) && !keeps(to)

/** One change of a read's tag in a history, with the Message that made it. */
export interface ReadStep<Message> {
  /** The read's name, as `timeline` was given it. */
  readonly read: string
  /** The history entry it changed at, from 0. */
  readonly index: number
  readonly message: Message
  readonly from: State
  readonly to: State
  /** `why` at the Model it changed to. */
  readonly why: ReadWhy
  /** It showed a value and stopped, with no reason a reader can see (#234). */
  readonly regression: boolean
}
