/**
 * The Remote wire: Effect RPC semantics over `effect/rpc`. Remote owns
 * the message shapes; Effect owns the transport. `Make`ing reads batch, mutations
 * preserve order, and live data is a stream.
 */
import { Schema } from 'effect'
import { Rpc, RpcGroup } from 'effect/rpc'
import type { RelationRequirement, Requirement } from './requirement.js'

/**
 * The read/live protocol version. A batch names the version it speaks and the
 * server refuses a mismatch with `RemoteProtocolError`, so a shape change never
 * drifts silently: bump it whenever `ReadRequest` or `LiveRequirement` change.
 */
export const REMOTE_PROTOCOL_VERSION = 6

export class RemoteReadError extends Schema.TaggedError<RemoteReadError>()('RemoteReadError', {
  message: Schema.String,
}) {}

export class RemoteMutationError extends Schema.TaggedError<RemoteMutationError>()(
  'RemoteMutationError',
  {
    message: Schema.String,
    /** The mutation's own `Refusal`, encoded, when the server refused it as one. */
    refusal: Schema.optional(Schema.Unknown),
  },
) {}

/**
 * No answer came back: the request could not be sent, or what came back was
 * not an answer. The server may or may not have run it, so it is safe to send
 * again only as the same operation, which a ledgered writer answers from its
 * record. The outbox sends a durable write again after it (#247).
 */
export class RemoteUnreachable extends Schema.TaggedError<RemoteUnreachable>()('Unreachable', {
  message: Schema.String,
}) {}

/**
 * The server refused who is asking: they may not do this, and asking again
 * as the same principal is refused again. `reason` is the application's own
 * words for the person who asked; without it the refusal says nothing of why.
 */
export class RemoteForbidden extends Schema.TaggedError<RemoteForbidden>()('Forbidden', {
  message: Schema.String,
  reason: Schema.optional(Schema.String),
}) {}

/**
 * The server could not tell who is asking: a credential was sent and no
 * longer holds, or none was sent where one is needed. Asking again as the
 * same caller is refused again; signing in again is the remedy. `reason` is
 * words for the person who asked; without it the refusal says nothing of why.
 */
export class RemoteUnauthenticated extends Schema.TaggedError<RemoteUnauthenticated>()(
  'Unauthenticated',
  {
    message: Schema.String,
    reason: Schema.optional(Schema.String),
  },
) {}

declare const RequestFrom: unique symbol

/**
 * A request as `serveFetch` hands it to its resolver: one the application's
 * own scripts send. Only a type, so that a resolver which reads a cookie
 * without asking for a script's headers (a navigation's) cannot be given
 * there: `foldkit-auth`'s `AuthServer.host` types its resolvers by these. A
 * resolver taking any `Request` fits both.
 */
export type ScriptedRequest = Request & { readonly [RequestFrom]: 'script' }

/** A page the browser navigates to, as `pageReader` hands it to its resolver; see `ScriptedRequest`. */
export type NavigationRequest = Request & { readonly [RequestFrom]: 'navigation' }

/**
 * A durable write was made for another principal than the one asking (its
 * `principal` names someone else): who is signed in changed since it was
 * made. Nothing ran. Asking again as the same caller is refused again; it
 * runs once the person it was made for asks (#405).
 */
export class RemotePrincipalChanged extends Schema.TaggedError<RemotePrincipalChanged>()(
  'PrincipalChanged',
  { message: Schema.String },
) {}

export class RemoteLiveError extends Schema.TaggedError<RemoteLiveError>()('RemoteLiveError', {
  message: Schema.String,
}) {}

/**
 * The server refused a live subscription for what it asks (more ids of one
 * Entity than `maxIdsPerEntity`), before reading anything. The same
 * requirements are refused again, so a client does not reconnect it.
 */
export class RemoteLiveRefused extends Schema.TaggedError<RemoteLiveRefused>()(
  'RemoteLiveRefused',
  { message: Schema.String },
) {}

/** The peer speaks another protocol version; nothing was read. */
export class RemoteProtocolError extends Schema.TaggedError<RemoteProtocolError>()(
  'RemoteProtocolError',
  { message: Schema.String, expected: Schema.Number, received: Schema.Number },
) {}

/** A page size: a non-negative integer, refused at decode otherwise rather than defaulted. */
export const PageSize = Schema.Number.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0))

export const WindowSchema = Schema.Struct({
  first: Schema.optional(PageSize),
  last: Schema.optional(PageSize),
  after: Schema.optional(Schema.String),
  before: Schema.optional(Schema.String),
})

/** A request may not name more fields of one entity than this; a selection never does. */
export const MAX_FIELDS_PER_REQUEST = 256
/** A selection may not nest relations deeper than this; the wire refuses more. */
export const MAX_RELATION_DEPTH = 8

const Fields = Schema.Array(Schema.String).check(Schema.isMaxLength(MAX_FIELDS_PER_REQUEST))

/**
 * The slice required of a relation's target; the ids come from the parent's
 * refs. Built as `MAX_RELATION_DEPTH` nested structs rather than a recursive
 * schema, so a deeper selection is refused at decode with a schema error.
 */
const relationLevel = (depth: number): Schema.Codec<RelationRequirement, RelationRequirement> => {
  const slice = {
    entity: Schema.String,
    fields: Fields,
    windows: Schema.optional(Schema.Record(Schema.String, WindowSchema)),
  }
  // A struct drops an unknown key silently; the last level refuses one instead.
  return (depth === 0
    ? Schema.Struct({ ...slice, relations: Schema.optionalKey(Schema.Never) })
    : Schema.Struct({
        ...slice,
        relations: Schema.optional(Schema.Record(Schema.String, relationLevel(depth - 1))),
      })) as unknown as Schema.Codec<RelationRequirement, RelationRequirement>
}

export const RelationRequest = relationLevel(MAX_RELATION_DEPTH - 1)

/** A read's fields, which a retention root (`model.ts`) carries too. */
export const readRequestFields = {
  entity: Schema.String,
  id: Schema.String,
  fields: Fields,
  /** Pagination window per relation field. */
  windows: Schema.optional(Schema.Record(Schema.String, WindowSchema)),
  /** The slice required of each relation field's target, resolved in the same read. */
  relations: Schema.optional(Schema.Record(Schema.String, RelationRequest)),
}

export const ReadRequest: Schema.Codec<Requirement, Requirement> = Schema.Struct(
  readRequestFields,
) as unknown as Schema.Codec<Requirement, Requirement>

/** A batch may name at most this many rows in `after`, a stream in `floors`, an answer in `behind` or `after.rows`. */
export const MAX_READ_AFTER = 256

/**
 * A read-after token: the server's own mark of a point in its history (a
 * Domain receipt, a D1 session bookmark). Remote never reads it; it only
 * sends it back with a read of the rows it was given for. Bounded, since a
 * client keeps it in its Model and sends it on every such read.
 */
export const ReadAfterToken = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512))

/**
 * A row's revision, when the server keeps one: a number every change of the
 * row moves forward. A client never lets a row of a lower revision over one
 * of a higher revision it holds.
 */
export const Revision = Schema.Finite

/** One row, by Entity and id. */
export const RowRef = Schema.Struct({ entity: Schema.String, id: Schema.String })

/** A row and the token a read of it must be current at. */
export const RowToken = Schema.Struct({
  entity: Schema.String,
  id: Schema.String,
  token: ReadAfterToken,
})

const RowTokens = Schema.Array(RowToken).check(Schema.isMaxLength(MAX_READ_AFTER))

/**
 * What a write's answer says of the rows it wrote: a read of them is current
 * only at or after `token`. Until such a read answers, the client keeps the
 * rows it holds and asks with the token (`ReadBatch.after`).
 */
export const ReadAfter = Schema.Struct({
  token: ReadAfterToken,
  rows: Schema.Array(RowRef).check(Schema.isMaxLength(MAX_READ_AFTER)),
})

export const ReadBatch = Schema.Struct({
  version: Schema.Number,
  requests: Schema.Array(ReadRequest),
  /**
   * The rows of `requests` a write's answer gave a token for (`MutationResult.after`)
   * that no read has answered at it yet: the server reads each at or after
   * its token, or names it in `behind`.
   */
  after: Schema.optional(RowTokens),
})

export const NormalizedEntity = Schema.Struct({
  entity: Schema.String,
  id: Schema.String,
  values: Schema.Record(Schema.String, Schema.Unknown),
  /** The row's revision, when the server keeps one: a lower one never overwrites a higher. */
  revision: Schema.optional(Revision),
})

/**
 * Fields a read asked for that the server answered without, and will not
 * answer with: the client stops asking. It says nothing about why, so a rule
 * that withholds a field is not itself on the wire.
 */
export const SettledFields = Schema.Struct({
  entity: Schema.String,
  id: Schema.String,
  fields: Schema.Array(Schema.String),
})

/**
 * Whom the server says it answers as: an opaque key of who asks (its `viewer`,
 * in `RemoteServer.make`), never read for anything but sending it back.
 * Bounded, since a write carries it back to be compared.
 */
export const PrincipalKey = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(512))

/**
 * Whom an answer was for: the key of who asked, `null` for a visitor. Absent
 * from a server that keeps no keys (it names no `viewer`) and from an older one.
 */
const answeredAs = Schema.optional(Schema.NullOr(PrincipalKey))

export const ReadBatchResult = Schema.Struct({
  entities: Schema.Array(NormalizedEntity),
  settled: Schema.Array(SettledFields),
  principal: answeredAs,
  /**
   * Rows of the batch's `after` the server could not read at their token
   * (its read model is behind): the client keeps what it holds of each and
   * asks with the token again.
   */
  behind: Schema.optional(Schema.Array(RowRef).check(Schema.isMaxLength(MAX_READ_AFTER))),
})

/** A read a mutation's answer carries: what was asked, and what came back. */
export const AnswerRead = Schema.Struct({
  requests: Schema.Array(ReadRequest),
  result: ReadBatchResult,
})

export const QueryRequest = Schema.Struct({
  query: Schema.String,
  input: Schema.Unknown,
  window: WindowSchema,
  /**
   * What to read of each item, as the relation slice a read asks the server
   * for. Absent for a query run without one: the response carries only edges,
   * and the client's read entry fetches fields in a second round trip.
   */
  select: Schema.optional(RelationRequest),
})

export const WireBoundary = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal('Terminal') }),
  Schema.Struct({ _tag: Schema.Literal('Cursor'), cursor: Schema.String }),
  Schema.Struct({ _tag: Schema.Literal('Unknown') }),
])

export const QueryEdge = Schema.Struct({
  entity: Schema.String,
  id: Schema.String,
  key: Schema.String,
})

export const QueryResult = Schema.Struct({
  edges: Schema.Array(QueryEdge),
  start: WireBoundary,
  end: WireBoundary,
  /**
   * The selected fields of the page's items, in the same shape a read batch
   * returns. Absent from a server that predates payload planning: the client
   * reads it as empty and fetches fields as before.
   */
  entities: Schema.optional(Schema.Array(NormalizedEntity)),
  settled: Schema.optional(Schema.Array(SettledFields)),
  principal: answeredAs,
})

/**
 * One operation's identity across every client: minted where it is first sent
 * and sent again with each retry of it. Bounded, since a server keys a record
 * of the write by it.
 */
export const OperationId = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(128),
  Schema.isPattern(/^[A-Za-z0-9:._-]+$/),
)

/** A mutation request may name at most this many entities in `shown`. */
export const MAX_SHOWN_ENTITIES = 256

/** A mutation request may ask at most this many lists back (`lists`); each is a query run after the write. */
export const MAX_ANSWER_LISTS = 8

/**
 * What a client reads of one entity's rows: a read request without its id. It
 * nests as deep as a read request does, so any slice a read asks can be sent.
 */
export const ShownSlice: Schema.Codec<RelationRequirement, RelationRequirement> = Schema.Struct({
  entity: Schema.String,
  fields: Fields,
  windows: Schema.optional(Schema.Record(Schema.String, WindowSchema)),
  relations: Schema.optional(Schema.Record(Schema.String, RelationRequest)),
}) as unknown as Schema.Codec<RelationRequirement, RelationRequirement>

export const MutationRequest = Schema.Struct({
  /**
   * This client's id for the request, the same on each retry of it. It is
   * unique within one client's Model only (a counter there), so it names a
   * request to that client; `operation` names it to a server.
   */
  requestId: Schema.String,
  /** The operation's identity across clients: what a server keys a record of the write by. */
  operation: Schema.optional(OperationId),
  mutation: Schema.String,
  input: Schema.Unknown,
  /** For a mutation that is a `Write`: the input keys to write, when not all of them. */
  keys: Schema.optional(Schema.Array(Schema.String)),
  /**
   * When the reader acted, in milliseconds since the epoch: what the client
   * predicted the write's time as. A server takes it within its `clockSkew`
   * of its own clock. Optional, so a client and a server of either age agree.
   */
  now: Schema.optional(Schema.Int),
  /**
   * What the client's active reads show of each entity's rows. The server
   * answers, of each row the mutation names, the shown fields its answer
   * left out, read as any read is (`MutationResult.read`).
   */
  shown: Schema.optional(Schema.Array(ShownSlice).check(Schema.isMaxLength(MAX_SHOWN_ENTITIES))),
  /**
   * The first page of each held list the client judges the write moves, as
   * its read entry would ask for it again. The server answers each it admits
   * after the write (`MutationResult.lists`); the client asks again for the rest.
   */
  lists: Schema.optional(Schema.Array(QueryRequest).check(Schema.isMaxLength(MAX_ANSWER_LISTS))),
  /**
   * The principal the write was made for, as an answer named it
   * (`MutationResult.principal`): the server refuses it as anyone else,
   * before running it, with `RemotePrincipalChanged`. `null` for a write
   * made with no one signed in: it runs only for a visitor. Absent for one
   * made before any answer said who: it runs as whoever asks. The outbox
   * sends it with every durable write (#405).
   */
  principal: Schema.optional(Schema.NullOr(PrincipalKey)),
})

/** A list a mutation's answer carries: the query as the client asked it, and its page. */
export const AnswerList = Schema.Struct({ request: QueryRequest, result: QueryResult })

export const LiveEdge = Schema.Struct({
  entity: Schema.String,
  id: Schema.String,
  key: Schema.String,
})

/** A connection change a mutation confirms: the same facts a live event carries, without a cursor. */
export const ConnectionChangeSchema = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal('Insert'),
    connection: Schema.String,
    position: Schema.Union([Schema.Literal('prepend'), Schema.Literal('append')]),
    edge: LiveEdge,
  }),
  Schema.Struct({ _tag: Schema.Literal('Remove'), connection: Schema.String, edge: LiveEdge }),
])

export const MutationResult = Schema.Struct({
  output: Schema.Unknown,
  entities: Schema.Array(NormalizedEntity),
  /** Connection changes the mutation made, applied alongside its entity patches. */
  connections: Schema.optional(Schema.Array(ConnectionChangeSchema)),
  /** Entities the mutation deleted; the client knows them absent from then on. */
  deleted: Schema.optional(
    Schema.Array(Schema.Struct({ entity: Schema.String, id: Schema.String })),
  ),
  /**
   * A fresh read, after the write, of what the request's `shown` asks of the
   * rows the answer names: the requirements read and what came back, written
   * as a read is.
   */
  read: Schema.optional(AnswerRead),
  /**
   * The first page, read after the write, of each list of the request's
   * `lists` the server admitted and could read; one it did not answer is
   * left out.
   */
  lists: Schema.optional(Schema.Array(AnswerList)),
  principal: answeredAs,
  /** A read of the rows the write wrote is current only at or after this. */
  after: Schema.optional(ReadAfter),
})

/** A live subscription may watch no more lists than this; each is run again every tick. */
export const MAX_LIVE_QUERIES = 32

export const LiveRequirement = Schema.Struct({
  version: Schema.Number,
  requirements: Schema.Array(ReadRequest),
  /** Lists read live (`liveQuery`), each as its read sends it. */
  queries: Schema.optional(Schema.Array(QueryRequest).check(Schema.isMaxLength(MAX_LIVE_QUERIES))),
  /** Resume cursor; events at or before it are duplicates. */
  after: Schema.Number,
  /**
   * Rows of `requirements` held to a read-after token (`ReadBatch.after`):
   * the stream sends none of them from before its token.
   */
  floors: Schema.optional(RowTokens),
})

/**
 * A live change. Entity changes update the store; connection changes alter
 * membership and ordering; both carry a per-stream cursor.
 */
export const LiveChange = Schema.Union([
  Schema.Struct({
    _tag: Schema.Literal('EntityPatched'),
    cursor: Schema.Number,
    entity: Schema.String,
    id: Schema.String,
    values: Schema.Record(Schema.String, Schema.Unknown),
    changed: Schema.Array(Schema.String),
    /** The row's revision after the change, when the server keeps one. */
    revision: Schema.optional(Revision),
  }),
  Schema.Struct({
    _tag: Schema.Literal('EntityDeleted'),
    cursor: Schema.Number,
    entity: Schema.String,
    id: Schema.String,
  }),
  Schema.Struct({
    _tag: Schema.Literal('ConnectionInsert'),
    cursor: Schema.Number,
    connection: Schema.String,
    position: Schema.Union([Schema.Literal('prepend'), Schema.Literal('append')]),
    edge: LiveEdge,
  }),
  Schema.Struct({
    _tag: Schema.Literal('ConnectionRemove'),
    cursor: Schema.Number,
    connection: Schema.String,
    edge: LiveEdge,
  }),
  Schema.Struct({
    _tag: Schema.Literal('ConnectionInvalidate'),
    cursor: Schema.Number,
    connection: Schema.String,
  }),
])

export const Read = Rpc.make('FoldkitRemoteRead', {
  payload: ReadBatch,
  success: ReadBatchResult,
  error: Schema.Union([RemoteReadError, RemoteProtocolError, RemoteUnauthenticated]),
})

export const Mutate = Rpc.make('FoldkitRemoteMutate', {
  payload: MutationRequest,
  success: MutationResult,
  error: Schema.Union([
    RemoteMutationError,
    RemoteForbidden,
    RemoteUnauthenticated,
    RemotePrincipalChanged,
  ]),
})

export const Live = Rpc.make('FoldkitRemoteLive', {
  payload: LiveRequirement,
  success: LiveChange,
  error: Schema.Union([
    RemoteLiveError,
    RemoteLiveRefused,
    RemoteProtocolError,
    RemoteUnauthenticated,
  ]),
  stream: true,
})

export class RemoteQueryError extends Schema.TaggedError<RemoteQueryError>()('RemoteQueryError', {
  message: Schema.String,
}) {}

export const QueryRpc = Rpc.make('FoldkitRemoteQuery', {
  payload: QueryRequest,
  success: QueryResult,
  error: Schema.Union([RemoteQueryError, RemoteUnauthenticated]),
})

export const RemoteRpc = RpcGroup.make(Read, Mutate, QueryRpc, Live)
