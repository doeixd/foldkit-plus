/**
 * A value on screen stays on screen (#234). For every RemoteMessage, a list or
 * an entity read that was `Ready` or `Refreshing` is after it `Ready`,
 * `Refreshing` or `Failed` with the value as `previous`: never `Loading` or
 * `Initial` while the value is held.
 *
 * Only a Message that removes the value may change it, and each such
 * exception below is named and narrow:
 * - the entity the read shows was deleted (a mutation's `deleted`, a live
 *   `EntityDeleted`, a read answered without it, or a pending
 *   `Remote.tombstone`), so it reads `NotFound`;
 * - a `Hydrated` snapshot under `replace` overwrote the store;
 * - retention dropped the read's root, which is past `departedLimit`.
 *
 * Every Message variant has generators (`messages` is checked against the
 * union, so a new variant does not compile until it has one). Each is applied
 * to a realistic loaded Model, then a seeded walk of them runs from it,
 * checking every step. The cases that once broke it, from Models of their
 * own, are in `regressions`.
 */
import { Match, Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Derived, Entity as DomainEntity, Expr, Held, Order, Relation, Write } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  ConnectionChange,
  Query,
  Remote,
  cursor,
  departedLimit,
  emptyLiveState,
  emptyStore,
  entityKey,
  isTombstone,
  predictionOfWrite,
  stableStringify,
  terminal,
  writeEntities,
  type RemoteData,
  type RemoteMessage,
  type RemoteMessageTag,
  type Requirement,
  windowGrowthKey,
  type OptimisticOperation,
} from '../src/index.js'

const User = DomainEntity.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const ProjectBase = DomainEntity.define(
  'Project',
  Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    status: Schema.String,
    ownerId: Schema.String,
  }),
)
const Blog = DomainEntity.relate(
  { User, Project: ProjectBase },
  { Project: { owner: Relation.one(User) } },
)
/** `mine`: the server's to answer, foreseen by the client for a project it writes. */
const Project = Blog.Project.pipe(
  DomainEntity.derived({
    mine: Derived.make(Schema.Boolean, {
      predict: ({ row, context }) =>
        Held.match(row.field('owner'), {
          onHeld: owner =>
            Option.map(context.viewer, viewer => viewer.entity === 'User' && viewer.id === owner),
          onUnheld: () => Option.none(),
        }),
    }),
  }),
)
const CreateProject = Write.insert(
  DomainEntity.input(
    Project,
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      status: Schema.String,
      owner: Schema.String,
    }),
    { owner: 'owner' },
  ),
  { id: 'id' },
)

const All = Query.define('All', {}, () =>
  Query.from(Project).pipe(Query.orderBy(Order.asc(Project.fields.id))),
)
const ByStatus = Query.define('ByStatus', { status: Schema.String }, ({ input }) =>
  Query.from(Project).pipe(
    Query.where(Expr.eq(Project.fields.status, input.status)),
    Query.orderBy(Order.asc(Project.fields.id)),
  ),
)

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Project, Blog.User],
  queries: [All, ByStatus],
})

const Named = DomainEntity.select(Project, { name: true })
const Owned = DomainEntity.select(Project, {
  name: true,
  owner: DomainEntity.select(Blog.User, { name: true }),
})

/** What the server holds. `p5` and `p6` exist but no list loaded them. */
const server: Readonly<Record<string, Readonly<Record<string, unknown>>>> = {
  'Project:p1': { name: 'One', status: 'open', owner: 'User:u1' },
  'Project:p2': { name: 'Two', status: 'open', owner: 'User:u2' },
  'Project:p3': { name: 'Three', status: 'done', owner: 'User:u1' },
  'Project:p5': { name: 'Five', status: 'open', owner: 'User:u1' },
  'Project:p6': { name: 'Six', status: 'open', owner: 'User:u2' },
  'User:u1': { name: 'Ada' },
  'User:u2': { name: 'Grace' },
}

const list = Data.query(All, {}, { select: Named, first: 25 })
const left = Data.query(ByStatus, { status: 'open' }, { select: Named, first: 25 })
const project = Data.get(Owned, 'p1')
const stale = Data.get(DomainEntity.select(Project, { status: true }), 'p2')

interface Watched {
  readonly name: string
  readonly read: (model: Model) => RemoteData<unknown>
  /** The entity it shows, when it is an entity read. */
  readonly entity: Option.Option<string>
  /** The list it shows, when it is a list read. */
  readonly list: Option.Option<string>
  /** Whether retention holds its root, and whether it holds as many such roots as it may. */
  readonly retained: (model: Model) => { readonly held: boolean; readonly full: boolean }
}

const heldConnection = (identity: string) => (model: Model) => ({
  held: model.remote.recent.connections.some(root => root.identity === identity),
  full: model.remote.recent.connections.length >= departedLimit.connections,
})
const heldRequirement = (key: string) => (model: Model) => ({
  held: model.remote.recent.requirements.some(root => entityKey(root.entity, root.id) === key),
  full: model.remote.recent.requirements.length >= departedLimit.requirements,
})

const watched: ReadonlyArray<Watched> = [
  {
    name: 'the list shown',
    read: list.read,
    entity: Option.none(),
    list: Option.some(list.ref.identity),
    retained: heldConnection(list.ref.identity),
  },
  {
    name: 'the list left',
    read: left.read,
    entity: Option.none(),
    list: Option.some(left.ref.identity),
    retained: heldConnection(left.ref.identity),
  },
  {
    name: 'p1 with its owner',
    read: project.read,
    entity: Option.some('Project:p1'),
    list: Option.none(),
    retained: heldRequirement('Project:p1'),
  },
  {
    name: 'p2 refreshing its status',
    read: stale.read,
    entity: Option.some('Project:p2'),
    list: Option.none(),
    retained: heldRequirement('Project:p2'),
  },
]

const edgeOf = (id: string) => ({ key: `Project:${id}`, ref: { entity: 'Project', id } })
const pick = (values: Readonly<Record<string, unknown>>, fields: ReadonlyArray<string>) =>
  Object.fromEntries(fields.filter(field => field in values).map(field => [field, values[field]]))

/** The server's answer to a read: every field asked for that it holds. */
const answered = (requests: ReadonlyArray<Requirement>, now = 0): RemoteMessage => ({
  _tag: 'ReadReceived',
  requests,
  result: {
    settled: [],
    entities: requests.flatMap(request => {
      const values = server[entityKey(request.entity, request.id)]
      return values === undefined
        ? []
        : [{ entity: request.entity, id: request.id, values: pick(values, request.fields) }]
    }),
  },
  now,
})

/** A list's first page as the server sends it, its rows' names riding on it. */
const page = (identity: string, ids: ReadonlyArray<string>, refreshes = true): RemoteMessage => ({
  _tag: 'ConnectionMerged',
  connection: identity,
  page: { edges: ids.map(edgeOf), start: terminal, end: terminal },
  refreshes,
  select: { entity: 'Project', fields: ['name'] },
  entities: ids.map(id => ({
    entity: 'Project',
    id,
    values: pick(server[`Project:${id}`]!, ['name']),
  })),
  now: 0,
})

const showing = (
  ...shown: ReadonlyArray<typeof list | typeof left | typeof project | typeof stale>
): RemoteMessage => ({
  _tag: 'RetentionChanged',
  roots: Remote.retain(shown).modelToDependencies({ remote: Remote.initial }),
})

const reduceAll = (model: Model, messages: ReadonlyArray<RemoteMessage>): Model =>
  messages.reduce(Data.reduce, model)

/** What the watched reads would ask the server for. */
const planned = (model: Model): ReadonlyArray<Requirement> => [
  ...Remote.plan(Data, model, project),
  ...Remote.plan(Data, model, stale),
  ...Remote.plan(Data, model, list),
  ...Remote.plan(Data, model, left),
]

/** Answers what the reads plan until they plan nothing more. */
const settle = (model: Model): Model => {
  let current = model
  for (let round = 0; round < 4; round++) {
    const requests = planned(current)
    if (requests.length === 0) return current
    current = Data.reduce(current, answered(requests))
  }
  return current
}

/**
 * The open list loaded, shown and then left (held stale, so `Refreshing`); the
 * full list and p1 with its owner loaded and shown (`Ready`); p2's status
 * loaded and being refreshed (`Refreshing`).
 */
const loaded = (): Model => {
  const listed = reduceAll({ remote: Remote.initial }, [
    page(left.ref.identity, ['p1', 'p2']),
    showing(list, left, project, stale),
    page(list.ref.identity, ['p1', 'p2', 'p3']),
  ])
  return reduceAll(settle(listed), [
    showing(list, project, stale),
    { _tag: 'RefreshStarted', requests: [{ entity: 'Project', id: 'p2', fields: ['status'] }] },
  ])
}

const down = { _tag: 'RemoteReadError', message: 'down' } as const
const nameOf = (id: string): Requirement => ({ entity: 'Project', id, fields: ['name'] })
const userName = (id: string): Requirement => ({ entity: 'User', id, fields: ['name'] })
const live = (model: Model, stream: string) =>
  (model.remote.live[stream] ?? emptyLiveState).cursor + 1

/** One Message for the Model as it is now. */
type Generate = (model: Model) => RemoteMessage

/** A durable rename of p1 as the outbox stores it, waiting or refused. */
const storedRename = (operation: string, name: string, state: 'Waiting' | 'Failed') => ({
  _tag: 'Readable' as const,
  input: { id: 'p1', name },
  write: {
    operation,
    mutation: 'Rename',
    input: { id: 'p1', name },
    optimistic: [{ entity: 'Project', id: 'p1', values: { name } }],
    shown: [],
    revision: 0,
    state:
      state === 'Waiting' ? { _tag: 'Waiting' as const } : { _tag: 'Failed' as const, error: down },
  },
})

/** Every Message variant's generators, by name. */
const messages = {
  ReadReceived: {
    'a refresh of p1 answered': () => answered([nameOf('p1')], 1),
    'a refresh of p1 with its owner answered': () =>
      answered([{ entity: 'Project', id: 'p1', fields: ['name', 'owner'] }, userName('u1')], 1),
    'a read of an unlisted row answered': () => answered([nameOf('p5')], 1),
    'what the reads plan answered': model => answered(planned(model), 1),
    'a read answered without p2, which is gone': () => ({
      _tag: 'ReadReceived',
      requests: [nameOf('p2')],
      result: { settled: [], entities: [] },
      now: 1,
    }),
  },
  ReadFailed: {
    "p1's refresh failed": () => ({ _tag: 'ReadFailed', requests: [nameOf('p1')], error: down }),
    "p1's owner's refresh failed": () => ({
      _tag: 'ReadFailed',
      requests: [userName('u1')],
      error: down,
    }),
    "a row's refresh failed": () => ({ _tag: 'ReadFailed', requests: [nameOf('p3')], error: down }),
    'a live stream broke': () => ({ _tag: 'ReadFailed', requests: [], error: down, stream: 's' }),
  },
  RefreshStarted: {
    'p1 refreshing': () => ({ _tag: 'RefreshStarted', requests: [nameOf('p1')] }),
    "p1's owner refreshing": () => ({ _tag: 'RefreshStarted', requests: [userName('u1')] }),
    // A row the walk deleted is asked about again too.
    'every row refreshing': () => ({
      _tag: 'RefreshStarted',
      requests: ['p1', 'p2', 'p3'].map(nameOf),
    }),
  },
  ReadStarted: {
    'p1 being read': () => ({ _tag: 'ReadStarted', requests: [nameOf('p1')] }),
    "p1's owner being read": () => ({ _tag: 'ReadStarted', requests: [userName('u1')] }),
    'the rows being read again': model => ({
      _tag: 'ReadStarted',
      requests: ['p1', 'p2', 'p3'].map(nameOf),
      refresh: model.remote.refresh.generation,
    }),
    'an unlisted row being read': () => ({ _tag: 'ReadStarted', requests: [nameOf('p5')] }),
  },
  QueryStarted: {
    'both lists queried': () => ({
      _tag: 'QueryStarted',
      connections: [list.ref.identity, left.ref.identity],
    }),
  },
  RetentionChanged: {
    'the same Surfaces': () => showing(list, project, stale),
    'going back to the open list': () => showing(left, stale),
    'leaving everything': () => showing(),
    'only the full list shown': () => showing(list),
  },
  Hydrated: {
    'a snapshot under preserve-existing': () => ({
      _tag: 'Hydrated',
      entities: writeEntities(emptyStore, [
        { key: 'Project:p1', values: { name: 'Old' } },
        { key: 'Project:p5', values: { name: 'Five' } },
      ]),
      connections: { [list.ref.identity]: [[edgeOf('p1')]] },
      merge: 'preserve-existing',
    }),
    'a snapshot under replace': () => ({
      _tag: 'Hydrated',
      entities: writeEntities(emptyStore, [{ key: 'Project:p1', values: { status: 'open' } }]),
      connections: { [list.ref.identity]: [[edgeOf('p6')]] },
      merge: 'replace',
    }),
  },
  MutationStarted: {
    "p1's name edited": () => ({
      _tag: 'MutationStarted',
      requestId: 'rename',
      optimistic: [{ entity: 'Project', id: 'p1', values: { name: 'Renamed' } }],
    }),
    "p1's name edited, durably": () => ({
      _tag: 'MutationStarted',
      requestId: 'session-rename',
      optimistic: [{ entity: 'Project', id: 'p1', values: { name: 'Kept' } }],
      write: {
        mutation: 'Rename',
        input: { id: 'p1', name: 'Kept' },
        durable: { input: { id: 'p1', name: 'Kept' }, shown: [] },
      },
    }),
    'a project created into the list': () => ({
      _tag: 'MutationStarted',
      requestId: 'create',
      optimistic: [
        { entity: 'Project', id: 'tmp', values: { name: 'Draft' } },
        ConnectionChange.prepend(list.ref, { entity: 'Project', id: 'tmp' }),
      ],
    }),
    'p3 removed from the list': () => ({
      _tag: 'MutationStarted',
      requestId: 'remove',
      optimistic: [ConnectionChange.remove(list.ref, { entity: 'Project', id: 'p3' })],
    }),
    'p2 being deleted': () => ({
      _tag: 'MutationStarted',
      requestId: 'delete',
      optimistic: [Remote.tombstone(Project, 'p2')],
    }),
    // What `Data.mutate` foresees of a new row: its own values, and a supplied member read off them.
    'a project of yours created, whose `mine` is foreseen': model => ({
      _tag: 'MutationStarted',
      requestId: 'create',
      optimistic: [
        ...predictionOfWrite(
          CreateProject,
          { id: 'p7', name: 'Seven', status: 'open', owner: 'u1' },
          undefined,
          {
            derived: new Map(),
            store: Data.storeOf(model),
            viewer: Option.some({ entity: 'User', id: 'u1' }),
            now: Option.some(1),
          },
        ),
        ConnectionChange.prepend(list.ref, { entity: 'Project', id: 'p7' }),
      ],
    }),
    // A layer keeps the viewer its operation was foreseen for, which pending placement reads.
    'p1 renamed by its owner, the layer keeping who asked': () => ({
      _tag: 'MutationStarted',
      requestId: 'rename',
      optimistic: [{ entity: 'Project', id: 'p1', values: { name: 'Renamed' } }],
      viewer: { entity: 'User', id: 'u1' },
    }),
    // A write `Data.mutate` refused where it was made: it shows nothing.
    'a write refused where it was made': () => ({
      _tag: 'MutationStarted',
      requestId: 'refused',
      write: { mutation: 'CreateProject', input: {} },
    }),
  },
  MutationSucceeded: {
    'the rename confirmed': () => ({
      _tag: 'MutationSucceeded',
      requestId: 'rename',
      entities: [{ entity: 'Project', id: 'p1', values: { name: 'Renamed' } }],
      now: 2,
    }),
    'the create confirmed': () => ({
      _tag: 'MutationSucceeded',
      requestId: 'create',
      entities: [{ entity: 'Project', id: 'p5', values: { name: 'Five' } }],
      connections: [ConnectionChange.prepend(list.ref, { entity: 'Project', id: 'p5' })],
      now: 2,
    }),
    'p2 deleted': () => ({
      _tag: 'MutationSucceeded',
      requestId: 'remove',
      entities: [],
      deleted: [{ entity: 'Project', id: 'p2' }],
      now: 2,
    }),
    'the pending delete confirmed': () => ({
      _tag: 'MutationSucceeded',
      requestId: 'delete',
      entities: [],
      deleted: [{ entity: 'Project', id: 'p2' }],
      now: 2,
    }),
  },
  MutationFailed: {
    'the rename failed': () => ({
      _tag: 'MutationFailed',
      requestId: 'rename',
      error: down,
      operation: 'op-rename',
    }),
    'the create failed': () => ({
      _tag: 'MutationFailed',
      requestId: 'create',
      error: down,
      operation: 'op-create',
    }),
    'the delete failed': () => ({
      _tag: 'MutationFailed',
      requestId: 'delete',
      error: down,
      operation: 'op-delete',
    }),
    'the write refused where it was made answered': () => ({
      _tag: 'MutationFailed',
      requestId: 'refused',
      error: {
        _tag: 'RemoteMutationError',
        message: 'Invalid',
        refusal: { _tag: 'Invalid', rule: 'rule', message: 'Invalid', path: [] },
      },
      operation: 'op-refused',
    }),
  },
  OverlayShown: {
    'a preview of a rename and a new row': () => ({
      _tag: 'OverlayShown',
      id: 'preview',
      optimistic: [
        { entity: 'Project', id: 'p1', values: { name: 'Preview' } },
        { entity: 'Project', id: 'draft', values: { name: 'Draft' } },
        ConnectionChange.append(list.ref, { entity: 'Project', id: 'draft' }),
      ],
    }),
    'a preview of p1 deleted': () => ({
      _tag: 'OverlayShown',
      id: 'preview-delete',
      optimistic: [Remote.tombstone(Project, 'p1')],
    }),
  },
  OverlayLifted: {
    'the preview lifted': () => ({ _tag: 'OverlayLifted', id: 'preview' }),
    'the delete preview lifted': () => ({ _tag: 'OverlayLifted', id: 'preview-delete' }),
  },
  WindowGrown: {
    'the list grown by a page': () => ({
      _tag: 'WindowGrown',
      window: windowGrowthKey(list.ref.identity, stableStringify(list.ref.window)),
      size: 50,
    }),
  },
  LiveReceived: {
    'p1 patched live': model => ({
      _tag: 'LiveReceived',
      stream: 's',
      event: {
        _tag: 'EntityPatched',
        ref: { entity: 'Project', id: 'p1' },
        values: { name: 'Live' },
        changed: ['name'],
        cursor: live(model, 's'),
      },
      now: 3,
    }),
    'p2 deleted live': model => ({
      _tag: 'LiveReceived',
      stream: 's',
      event: {
        _tag: 'EntityDeleted',
        ref: { entity: 'Project', id: 'p2' },
        cursor: live(model, 's'),
      },
      now: 3,
    }),
    'a row removed live': model => ({
      _tag: 'LiveReceived',
      stream: 's',
      event: {
        _tag: 'ConnectionRemove',
        connection: list.ref.identity,
        edge: edgeOf('p3'),
        cursor: live(model, 's'),
      },
      now: 3,
    }),
    'the list invalidated live': model => ({
      _tag: 'LiveReceived',
      stream: 's',
      event: {
        _tag: 'ConnectionInvalidate',
        connection: list.ref.identity,
        cursor: live(model, 's'),
      },
      now: 3,
    }),
  },
  GapCleared: {
    'the stream resubscribed': () => ({ _tag: 'GapCleared', stream: 's' }),
  },
  ConnectionMerged: {
    "the list's refresh answered": () => page(list.ref.identity, ['p1', 'p3', 'p5']),
    "the open list's refresh answered": () => page(left.ref.identity, ['p1', 'p2', 'p6']),
  },
  ConnectionInvalidated: {
    'the list invalidated': () => ({
      _tag: 'ConnectionInvalidated',
      connection: list.ref.identity,
    }),
    'the open list invalidated': () => ({
      _tag: 'ConnectionInvalidated',
      connection: left.ref.identity,
    }),
  },
  ConnectionRefreshed: {
    'the list marked fresh': () => ({ _tag: 'ConnectionRefreshed', connection: list.ref.identity }),
    'the open list marked fresh': () => ({
      _tag: 'ConnectionRefreshed',
      connection: left.ref.identity,
    }),
  },
  QueryFailed: {
    "the list's query failed": () => ({
      _tag: 'QueryFailed',
      connection: list.ref.identity,
      error: down,
    }),
    "the open list's query failed": () => ({
      _tag: 'QueryFailed',
      connection: left.ref.identity,
      error: down,
    }),
  },
  Preloaded: {
    'a destination preloaded over what is shown': () => ({
      _tag: 'Preloaded',
      messages: [
        { _tag: 'QueryStarted', connections: [list.ref.identity] },
        page(list.ref.identity, ['p1', 'p2']),
        answered([nameOf('p5')]),
      ],
    }),
  },
  CompletedReportDiagnostics: {
    'diagnostics reported': () => ({ _tag: 'CompletedReportDiagnostics' }),
  },
  MutationQueued: {
    'a durable write queued': () => ({ _tag: 'MutationQueued', requestId: 'session-rename' }),
  },
  OutboxRead: {
    'the store read back, holding a rename another tab queued': () => ({
      _tag: 'OutboxRead',
      key: 'outbox',
      scope: 'ada',
      session: 'session',
      entries: [storedRename('other-rename', 'Elsewhere', 'Waiting')],
      done: [],
    }),
    'the store read back, a rename refused in another tab': () => ({
      _tag: 'OutboxRead',
      key: 'outbox',
      scope: 'ada',
      entries: [storedRename('other-refused', 'Refused', 'Failed')],
      done: [],
    }),
    'the store read back, the durable rename settled in another tab': () => ({
      _tag: 'OutboxRead',
      key: 'outbox',
      scope: 'ada',
      entries: [],
      done: ['session-rename', 'other-rename'],
    }),
    'the store read back, a write this version cannot read': () => ({
      _tag: 'OutboxRead',
      key: 'outbox',
      scope: 'ada',
      entries: [{ _tag: 'Unreadable', operation: 'old', revision: 0, raw: {}, reason: 'retired' }],
      done: [],
    }),
    'the store read under another key': () => ({
      _tag: 'OutboxRead',
      key: 'outbox:grace',
      scope: 'grace',
      entries: [],
      done: [],
    }),
  },
  OutboxDelayed: {
    'the durable rename sent, and nothing answered': () => ({
      _tag: 'OutboxDelayed',
      requestId: 'session-rename',
      attempt: 1,
      error: { _tag: 'Unreachable', message: 'offline' },
    }),
  },
} satisfies Record<RemoteMessageTag, Readonly<Record<string, Generate>>>

const cases = Object.entries(messages).flatMap(([tag, generators]) =>
  Object.entries<Generate>(generators).map(
    ([name, generate]) => ({ tag, name, generate }) as const,
  ),
)

/**
 * Messages that took a held list off screen while a list read `Loading` until
 * every row it showed had its fields (#234): a row entering it unread hid
 * every row already shown. A list now leaves such a row out until it is read.
 */
const regressions: ReadonlyArray<{
  readonly name: string
  readonly from: () => Model
  readonly message: Generate
}> = [
  {
    name: 'a live insert of a row not yet read',
    from: loaded,
    message: model => ({
      _tag: 'LiveReceived',
      stream: 's',
      event: {
        _tag: 'ConnectionInsert',
        connection: list.ref.identity,
        position: 'prepend',
        edge: edgeOf('p6'),
        cursor: live(model, 's'),
      },
      now: 3,
    }),
  },
  {
    name: 'a later page whose rows are not yet read',
    from: loaded,
    message: () => ({
      _tag: 'ConnectionMerged',
      connection: list.ref.identity,
      page: { edges: [edgeOf('p3'), edgeOf('p6')], start: cursor('p3'), end: terminal },
    }),
  },
  {
    name: "a refresh answered without its rows' fields",
    from: loaded,
    message: () => ({
      _tag: 'ConnectionMerged',
      connection: list.ref.identity,
      page: { edges: ['p1', 'p5'].map(edgeOf), start: terminal, end: terminal },
      refreshes: true,
    }),
  },
  {
    // `RefreshStarted` once forgot a tombstone so the row could be read again,
    // and until it was, the row the tombstone hid was back in the list unread.
    name: 'a deleted row asked about again',
    from: () =>
      Data.reduce(loaded(), {
        _tag: 'MutationSucceeded',
        requestId: 'remove',
        entities: [],
        deleted: [{ entity: 'Project', id: 'p3' }],
        now: 2,
      }),
    message: () => ({ _tag: 'RefreshStarted', requests: [nameOf('p3')] }),
  },
  // A list whose every shown row was deleted while the rest were unread read as
  // if it had never shown anything: `Loading` with a read in flight (seed 174,
  // #263), `Initial` without. It now reads `Refreshing` with no rows. The
  // snapshot leaves the open list's p1 without its name, so p2 is all it shows.
  ...(
    [
      ['the one row shown deleted', messages.MutationSucceeded['p2 deleted']],
      ['the one row shown deleted pending', messages.MutationStarted['p2 being deleted']],
    ] as const
  ).flatMap(([name, message]) => [
    {
      name: `${name} while the others are unread`,
      from: () => Data.reduce(loaded(), messages.Hydrated['a snapshot under replace']()),
      message,
    },
    {
      name: `${name} while the others are read`,
      from: () =>
        reduceAll(loaded(), [
          messages.Hydrated['a snapshot under replace'](),
          { _tag: 'ReadStarted', requests: [nameOf('p1')] },
        ]),
      message,
    },
  ]),
  {
    // A refresh forgot a tombstone, so the deleted row was back in the list
    // unread, and the list above read `Initial` again.
    name: 'the one row shown deleted, then asked about again',
    from: () =>
      reduceAll(loaded(), [
        messages.Hydrated['a snapshot under replace'](),
        messages.MutationSucceeded['p2 deleted'](),
      ]),
    message: messages.RefreshStarted['every row refreshing'],
  },
]

/** The exceptions, by name: each one a Message that really removes the value. */
const exception = (
  read: Watched,
  message: RemoteMessage,
  before: Model,
  after: Model,
): Option.Option<string> => {
  if (
    read.read(after)._tag === 'NotFound' &&
    Option.exists(
      read.entity,
      key => deletes(message, key) && isTombstone(Data.storeOf(after), key),
    )
  ) {
    return Option.some('the entity it shows was deleted')
  }
  if (message._tag === 'Hydrated' && message.merge === 'replace') {
    return Option.some('a snapshot replaced the store')
  }
  const retention = read.retained(after)
  if (
    message._tag === 'RetentionChanged' &&
    read.retained(before).held &&
    !retention.held &&
    retention.full
  ) {
    return Option.some('retention dropped it past departedLimit')
  }
  return Option.none()
}

const pendingDelete = (operations: ReadonlyArray<OptimisticOperation>, key: string): boolean =>
  operations.some(
    operation =>
      '_tag' in operation &&
      operation._tag === 'Delete' &&
      entityKey(operation.entity, operation.id) === key,
  )

/** Whether `message` says the entity is gone. */
const deletes = (message: RemoteMessage, key: string): boolean =>
  Match.value(message).pipe(
    Match.tags({
      MutationSucceeded: ({ deleted }) =>
        (deleted ?? []).some(ref => entityKey(ref.entity, ref.id) === key),
      LiveReceived: ({ event }) =>
        event._tag === 'EntityDeleted' && entityKey(event.ref.entity, event.ref.id) === key,
      // Asked for by id, and answered with neither it nor any of its fields.
      ReadReceived: ({ requests, result }) =>
        requests.some(request => entityKey(request.entity, request.id) === key) &&
        ![...result.entities, ...result.settled].some(
          entry => entityKey(entry.entity, entry.id) === key,
        ),
      Preloaded: ({ messages }) => messages.some(inner => deletes(inner, key)),
      // Deleted while a request, or a preview, is pending.
      MutationStarted: ({ optimistic }) => pendingDelete(optimistic ?? [], key),
      OverlayShown: ({ optimistic }) => pendingDelete(optimistic, key),
    }),
    Match.orElse(() => false),
  )

const holds = (read: RemoteData<unknown>): boolean =>
  read._tag === 'Ready' || read._tag === 'Refreshing'

/** Whether `after` keeps the value `before` showed. */
const kept = (after: RemoteData<unknown>): boolean =>
  holds(after) || (after._tag === 'Failed' && after.previous !== undefined)

/** The reads `message` took off screen without one of the exceptions. */
const violations = (before: Model, message: RemoteMessage): ReadonlyArray<string> => {
  const after = Data.reduce(before, message)
  return watched.flatMap(read => {
    if (!holds(read.read(before)) || kept(read.read(after))) return []
    return Option.isSome(exception(read, message, before, after))
      ? []
      : [`${read.name}: ${read.read(before)._tag} -> ${read.read(after)._tag}`]
  })
}

const generator = (seed: number) => {
  let state = seed
  return (max: number) => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return Math.floor((state / 0x7fffffff) * max)
  }
}

describe('A value on screen', () => {
  it('starts from a fixture holding every watched read', () => {
    expect(watched.map(read => read.read(loaded())._tag)).toEqual([
      'Ready',
      'Refreshing',
      'Ready',
      'Refreshing',
    ])
  })

  it.each(regressions)('is kept through $name', ({ from, message }) => {
    const model = from()
    expect(violations(model, message(model))).toEqual([])
  })

  it.each(cases)('is kept through $tag: $name', ({ generate }) => {
    const model = loaded()
    expect(violations(model, generate(model))).toEqual([])
  })

  it('is kept through every seeded walk of Messages', () => {
    const found: string[] = []
    for (let seed = 1; seed <= 200 && found.length === 0; seed++) {
      const random = generator(seed)
      let model = loaded()
      const walk: string[] = []
      for (let step = 0; step < 12; step++) {
        const { tag, name, generate } = cases[random(cases.length)]!
        const message = generate(model)
        walk.push(`${tag}: ${name}`)
        const broken = violations(model, message)
        if (broken.length > 0) {
          found.push(`seed ${seed}, after ${walk.join(' > ')}: ${broken.join('; ')}`)
          break
        }
        model = Data.reduce(model, message)
      }
    }
    expect(found).toEqual([])
  })
})

describe('Each exception', () => {
  it.each([
    [
      'a read answered without it',
      messages.ReadReceived['a read answered without p2, which is gone'],
    ],
    ['a mutation that deleted it', messages.MutationSucceeded['p2 deleted']],
    ['a live delete', messages.LiveReceived['p2 deleted live']],
    ['a pending delete', messages.MutationStarted['p2 being deleted']],
  ])('%s takes p2 off screen as NotFound', (_, generate: Generate) => {
    const model = loaded()
    const message = generate(model)
    const after = Data.reduce(model, message)

    expect(stale.read(after)._tag).toBe('NotFound')
    expect(exception(watched[3]!, message, model, after)).toEqual(
      Option.some('the entity it shows was deleted'),
    )
  })

  it('a snapshot under replace may take a value away', () => {
    const model = loaded()
    const message = messages.Hydrated['a snapshot under replace']()
    const after = Data.reduce(model, message)

    expect(project.read(after)._tag).toBe('Initial')
    expect(exception(watched[2]!, message, model, after)).toEqual(
      Option.some('a snapshot replaced the store'),
    )
  })

  it(`retention may drop a list once ${departedLimit.connections} more are left`, () => {
    const others = Array.from({ length: departedLimit.connections }, (_, i) =>
      showing(Data.query(ByStatus, { status: `s${i}` }, { select: Named, first: 25 })),
    )
    const before = reduceAll(loaded(), others.slice(0, -1))
    const message = others.at(-1)!
    const after = Data.reduce(before, message)

    expect(left.read(before)._tag).toBe('Refreshing')
    expect(left.read(after)._tag).toBe('Initial')
    expect(exception(watched[1]!, message, before, after)).toEqual(
      Option.some('retention dropped it past departedLimit'),
    )
  })
})
