/**
 * A list whose body reads other rows through an exists (#344): Home, an
 * account's own posts and those of everyone it follows. A pending follow
 * brings the followed account's posts the store holds into it, where the
 * order puts them; a pending unfollow takes out what the store can still
 * judge, and leaves what an exists over rows the store may lack decides.
 * The answer settles it: the list is judged again and fetched, or written
 * from the page the answer carries.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Collation, Entity, Expr, Order, ReadFilter, Relation } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Mutation,
  Query,
  Remote,
  RemoteData,
  markStale,
  matching,
  type NormalizedPatch,
} from '../src/index.js'

const UserFields = Entity.define(
  'User',
  Schema.Struct({ id: Schema.String, handle: Schema.String }),
)
const PostFields = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, body: Schema.String, createdAt: Schema.Number }),
)
const FollowFields = Entity.define('Follow', Schema.Struct({ id: Schema.String }))
const { User, Post, Follow } = Entity.relate(
  { User: UserFields, Post: PostFields, Follow: FollowFields },
  {
    Post: { author: Relation.one(UserFields) },
    Follow: { follower: Relation.one(UserFields), followee: Relation.one(UserFields) },
  },
)

const Home = Query.define('Home', { accountId: Schema.String }, ({ input }) =>
  Query.from(Post).pipe(
    Query.where(
      Expr.or(
        Expr.eq(Post.relations.author, input.accountId),
        Expr.path(
          Post.relations.author,
          Expr.exists(
            Follow.relations.followee,
            Expr.eq(Follow.relations.follower, input.accountId),
          ),
        ),
      ),
    ),
    Query.orderBy(
      Order.desc(Post.fields.createdAt),
      Order.asc(Post.fields.id, { collation: Collation.binary }),
    ),
  ),
)

/** Whom an account follows: a list whose body fixes only the follower, so read whole it is every follow of theirs. */
const Following = Query.define('Following', { accountId: Schema.String }, ({ input }) =>
  Query.from(Follow).pipe(
    Query.where(Expr.eq(Follow.relations.follower, input.accountId)),
    Query.orderBy(Order.asc(Follow.fields.id, { collation: Collation.binary })),
  ),
)

/** Posts by whoever goes by a handle: a path the store follows to the author's row. */
const ByHandle = Query.define('ByHandle', { handle: Schema.String }, ({ input }) =>
  Query.from(Post).pipe(
    Query.where(Expr.eq(Expr.path(Post.relations.author, User.fields.handle), input.handle)),
    Query.orderBy(Order.asc(Post.fields.id, { collation: Collation.binary })),
  ),
)

const FollowAccount = Mutation.make('FollowAccount', {
  Input: { id: Schema.String, followee: Schema.String },
  Output: {},
})
const UnfollowAccount = Mutation.make('UnfollowAccount', {
  Input: { id: Schema.String },
  Output: {},
})
const Rename = Mutation.make('Rename', {
  Input: { id: Schema.String, handle: Schema.String },
  Output: {},
})
const DropUser = Mutation.make('DropUser', { Input: { id: Schema.String }, Output: {} })

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [User, Post, Follow],
  queries: [Home, ByHandle, Following],
  mutations: [FollowAccount, UnfollowAccount, Rename, DropUser],
})

const Shown = Entity.select(Post, { id: true, body: true })
const home = Data.query(Home, { accountId: 'me' }, { select: Shown, first: 25 })
const byBo = Data.query(ByHandle, { handle: 'bo' }, { select: Shown, first: 25 })
const Followed = Entity.select(Follow, { id: true })
const followsOf = (accountId: string) =>
  Data.query(Following, { accountId }, { select: Followed, first: 25 })

const user = (id: string): NormalizedPatch => ({ entity: 'User', id, values: { id, handle: id } })
const post = (id: string, author: string, createdAt: number): NormalizedPatch => ({
  entity: 'Post',
  id,
  values: { id, body: id, createdAt, author: `User:${author}` },
})
const follow = (id: string, follower: string, followee: string): NormalizedPatch => ({
  entity: 'Follow',
  id,
  values: { id, follower: `User:${follower}`, followee: `User:${followee}` },
})

// Mine is p1; ada, whom I follow, wrote p2; bo, whom I do not, wrote p3 and p4.
const rows = [
  user('me'),
  user('ada'),
  user('bo'),
  post('p1', 'me', 10),
  post('p2', 'ada', 20),
  post('p3', 'bo', 30),
  post('p4', 'bo', 5),
  // Its author's row was never sent, so whether it is in Home is the server's to say.
  post('p5', 'dee', 40),
  follow('f1', 'me', 'ada'),
]

const holding = (model: Model, identity: string, ids: ReadonlyArray<string>): Model =>
  Data.reduce(model, {
    _tag: 'ConnectionMerged',
    connection: identity,
    page: {
      edges: ids.map(id => ({ key: `Post:${id}`, ref: { entity: 'Post', id } })),
      start: { _tag: 'Terminal' },
      end: { _tag: 'Terminal' },
    },
  })

/** The store holding every row, and Home and bo's posts as the server lists them. */
const loaded = (): Model => {
  const read = Data.reduce(
    { remote: Remote.initial },
    {
      _tag: 'ReadReceived',
      requests: rows.map(row => ({
        entity: row.entity,
        id: row.id,
        fields: Object.keys(row.values),
      })),
      result: { settled: [], entities: rows },
      now: 0,
    },
  )
  return holding(holding(read, home.ref.identity, ['p2', 'p1']), byBo.ref.identity, ['p3', 'p4'])
}

interface Listed {
  readonly read: (
    model: Model,
  ) => RemoteData<{ readonly items: ReadonlyArray<{ readonly id: string }> }>
}

/** What a list shows, and whether it is being fetched again. */
const shown = (model: Model, read: Listed = home) =>
  RemoteData.match<{ readonly items: ReadonlyArray<{ readonly id: string }> }, unknown>(
    read.read(model),
    {
      Initial: () => 'Initial',
      Loading: () => 'Loading',
      Ready: page => page.items.map(item => item.id),
      Refreshing: page => ({ refreshing: page.items.map(item => item.id) }),
      Failed: error => error,
      NotFound: () => 'NotFound',
    },
  )

const following = (model: Model, followee: string) =>
  Data.mutate(
    model,
    FollowAccount,
    { id: 'f2', followee },
    {
      requestId: 'follow',
      optimistic: [
        Remote.patch(Follow, 'f2', {
          id: 'f2',
          follower: Remote.ref(UserFields, 'me'),
          followee: Remote.ref(UserFields, followee),
        }),
      ],
    },
  ).model

const unfollowing = (model: Model) =>
  Data.mutate(
    model,
    UnfollowAccount,
    { id: 'f1' },
    { requestId: 'unfollow', optimistic: [Remote.tombstone(Follow, 'f1')] },
  ).model

describe('A pending follow', () => {
  it('starts from Home as the server lists it', () => {
    expect(shown(loaded())).toEqual(['p2', 'p1'])
  })

  it('brings the followed account’s held posts into Home, where its order puts them', () => {
    const base = loaded()
    const pending = following(base, 'bo')
    expect(shown(pending)).toEqual(['p3', 'p2', 'p1', 'p4'])
    // Only what a read shows moves: the server's pages are as they were.
    expect(pending.remote.connections).toBe(base.remote.connections)
  })

  it('brings in nothing when it follows someone whose posts the store does not hold', () => {
    expect(shown(following(loaded(), 'cy'))).toEqual(['p2', 'p1'])
  })

  it('keeps them through the answer, and fetches Home again for any the store lacks', () => {
    const answered = Data.reduce(following(loaded(), 'bo'), {
      _tag: 'MutationSucceeded',
      requestId: 'follow',
      entities: [follow('f2', 'me', 'bo')],
      now: 1,
    })
    expect(answered.remote.optimistic.layers).toEqual([])
    expect(shown(answered)).toEqual({ refreshing: ['p3', 'p2', 'p1', 'p4'] })
  })

  it('takes the page the answer carries for Home', () => {
    const answered = Data.reduce(following(loaded(), 'bo'), {
      _tag: 'MutationSucceeded',
      requestId: 'follow',
      entities: [follow('f2', 'me', 'bo')],
      lists: [
        {
          request: {
            query: 'Home',
            input: { accountId: 'me' },
            window: { first: 25 },
            select: { entity: 'Post', fields: ['id', 'body'] },
          },
          result: {
            edges: ['p3', 'p2', 'p1', 'p4'].map(id => ({ entity: 'Post', id, key: `Post:${id}` })),
            start: { _tag: 'Terminal' },
            end: { _tag: 'Terminal' },
            entities: [],
            settled: [],
          },
        },
      ],
      now: 1,
    })
    expect(shown(answered)).toEqual(['p3', 'p2', 'p1', 'p4'])
  })

  it('leaves to the server a held post whose author the store lacks', () => {
    const store = Data.storeOf(following(loaded(), 'bo'))
    expect(matching(store, Home, { accountId: 'me' })).toEqual({
      matched: ['Post:p3', 'Post:p2', 'Post:p1', 'Post:p4'],
      skipped: ['Post:p5'],
    })
  })

  it('does not count a follow whose followee the store holds as stale', () => {
    const base = loaded()
    const store = markStale(Data.storeOf(base), 'Follow:f1', ['followee'])
    expect(matching(store, Home, { accountId: 'me' }).skipped).toContain('Post:p2')
  })

  it('brings in nothing where the server filters posts by a rule the client does not run', () => {
    const Ruled = Post.pipe(Entity.annotate(ReadFilter.of(['body'])))
    const Filtered = Remote.make({
      model: App.model.remote,
      entities: [User, Ruled, Follow],
      queries: [Home],
      mutations: [FollowAccount],
    })
    const read = Filtered.query(Home, { accountId: 'me' }, { select: Shown, first: 25 })
    const pending = Filtered.mutate(
      { remote: loaded().remote },
      FollowAccount,
      { id: 'f2', followee: 'bo' },
      {
        optimistic: [
          Remote.patch(Follow, 'f2', {
            id: 'f2',
            follower: Remote.ref(UserFields, 'me'),
            followee: Remote.ref(UserFields, 'bo'),
          }),
        ],
      },
    ).model
    expect(shown(pending, read)).toEqual(['p2', 'p1'])
  })

  it('is taken back when the follow fails', () => {
    const failed = Data.reduce(following(loaded(), 'bo'), {
      _tag: 'MutationFailed',
      requestId: 'follow',
      operation: 'FollowAccount',
      error: { _tag: 'RemoteMutationError', message: 'offline' },
    })
    expect(shown(failed)).toEqual(['p2', 'p1'])
  })
})

describe('A pending unfollow', () => {
  it('leaves the posts only an exists the store cannot complete decides', () => {
    // Another follow of ada by me may exist that the store was never sent.
    expect(shown(unfollowing(loaded()))).toEqual(['p2', 'p1'])
  })

  it('takes back what a pending follow it undoes brought in', () => {
    const both = Data.mutate(
      following(loaded(), 'bo'),
      UnfollowAccount,
      { id: 'f2' },
      { requestId: 'unfollow', optimistic: [Remote.tombstone(Follow, 'f2')] },
    ).model
    expect(shown(both)).toEqual(['p2', 'p1'])
  })

  it('is settled by Home fetched again, or by the page its answer carries', () => {
    const answered = Data.reduce(unfollowing(loaded()), {
      _tag: 'MutationSucceeded',
      requestId: 'unfollow',
      entities: [],
      deleted: [{ entity: 'Follow', id: 'f1' }],
      now: 1,
    })
    expect(shown(answered)).toEqual({ refreshing: ['p2', 'p1'] })
  })
})

/** `model` with `patches` read too. */
const reading = (model: Model, patches: ReadonlyArray<NormalizedPatch>): Model =>
  Data.reduce(model, {
    _tag: 'ReadReceived',
    requests: patches.map(row => ({
      entity: row.entity,
      id: row.id,
      fields: Object.keys(row.values),
    })),
    result: { settled: [], entities: patches },
    now: 0,
  })

/** `model` holding whom `accountId` follows as the server lists it: to its end, or with more. */
const follows = (
  model: Model,
  ids: ReadonlyArray<string>,
  options: { readonly accountId?: string; readonly more?: boolean } = {},
): Model =>
  Data.reduce(model, {
    _tag: 'ConnectionMerged',
    connection: followsOf(options.accountId ?? 'me').ref.identity,
    page: {
      edges: ids.map(id => ({ key: `Follow:${id}`, ref: { entity: 'Follow', id } })),
      start: { _tag: 'Terminal' },
      end: options.more === true ? { _tag: 'Cursor', cursor: 'next' } : { _tag: 'Terminal' },
    },
  })

describe('A pending unfollow, with every follow of mine held (#409)', () => {
  const whole = () => follows(loaded(), ['f1'])

  it('takes the unfollowed account’s posts out of Home', () => {
    expect(shown(unfollowing(whole()))).toEqual(['p1'])
  })

  it('keeps them while another follow of theirs is held', () => {
    const twice = follows(reading(loaded(), [follow('f3', 'me', 'ada')]), ['f1', 'f3'])
    expect(shown(unfollowing(twice))).toEqual(['p2', 'p1'])
  })

  it('takes them out once answered, and fetches Home again', () => {
    const answered = Data.reduce(unfollowing(whole()), {
      _tag: 'MutationSucceeded',
      requestId: 'unfollow',
      entities: [],
      deleted: [{ entity: 'Follow', id: 'f1' }],
      now: 1,
    })
    expect(shown(answered)).toEqual({ refreshing: ['p1'] })
  })

  it.each([
    ['with more to load', () => follows(loaded(), ['f1'], { more: true })],
    [
      'gone stale',
      () =>
        Data.reduce(whole(), {
          _tag: 'ConnectionInvalidated',
          connection: followsOf('me').ref.identity,
        }),
    ],
    ['of another account', () => follows(loaded(), [], { accountId: 'bo' })],
    [
      'holding a follow whose followee the store lacks',
      () =>
        follows(
          reading(loaded(), [
            { entity: 'Follow', id: 'f4', values: { id: 'f4', follower: 'User:me' } },
          ]),
          ['f1', 'f4'],
        ),
    ],
    [
      'holding another follow whose followee the store holds as stale',
      () => {
        const model = follows(reading(loaded(), [follow('f3', 'me', 'ada')]), ['f1', 'f3'])
        return {
          remote: {
            ...model.remote,
            entities: markStale(model.remote.entities, 'Follow:f3', ['followee']),
          },
        }
      },
    ],
  ])('leaves Home to the server when the list of whom I follow is %s', (_, held) => {
    expect(shown(unfollowing(held()))).toEqual(['p2', 'p1'])
  })
})

describe('A pending write to a row a path reaches', () => {
  const renaming = (model: Model, handle: string) =>
    Data.mutate(
      model,
      Rename,
      { id: 'bo', handle },
      { requestId: 'rename', optimistic: [Remote.patch(User, 'bo', { handle })] },
    ).model

  it('takes out the posts it leads away from', () => {
    expect(shown(loaded(), byBo)).toEqual(['p3', 'p4'])
    expect(shown(renaming(loaded(), 'robert'), byBo)).toEqual([])
  })

  it('takes out the posts of an author a pending delete removes', () => {
    const dropped = Data.mutate(
      loaded(),
      DropUser,
      { id: 'bo' },
      { optimistic: [Remote.tombstone(User, 'bo')] },
    ).model
    expect(shown(dropped, byBo)).toEqual([])
  })

  it('brings in the posts it leads to', () => {
    const ada = Data.query(ByHandle, { handle: 'ada' }, { select: Shown, first: 25 })
    const model = holding(loaded(), ada.ref.identity, ['p2'])
    expect(shown(renaming(model, 'ada'), ada)).toEqual(['p2', 'p3', 'p4'])
  })
})

describe('A pending write that reaches other rows and moves its own (#344)', () => {
  const TaskFields = Entity.define(
    'Task',
    Schema.Struct({ id: Schema.String, rank: Schema.Number, done: Schema.Boolean }),
  )
  const { Task } = Entity.relate(
    { Task: TaskFields },
    { Task: { parent: Relation.one(TaskFields) } },
  )
  /** Tasks whose parent is still open, by rank: a task's own `done` is read through its children. */
  const Open = Query.define('Open', {}, () =>
    Query.from(Task).pipe(
      Query.where(Expr.eq(Expr.path(Task.relations.parent, Task.fields.done), false)),
      Query.orderBy(
        Order.asc(Task.fields.rank),
        Order.asc(Task.fields.id, { collation: Collation.binary }),
      ),
    ),
  )
  const Finish = Mutation.make('Finish', {
    Input: { id: Schema.String, rank: Schema.Number },
    Output: {},
  })
  const Tasks = Remote.make({
    model: App.model.remote,
    entities: [Task],
    queries: [Open],
    mutations: [Finish],
  })
  const open = Tasks.query(Open, {}, { select: Entity.select(Task, { id: true }), first: 25 })
  const task = (id: string, rank: number, parent: string | null): NormalizedPatch => ({
    entity: 'Task',
    id,
    values: { id, rank, done: false, parent: parent === null ? null : `Task:${parent}` },
  })
  // t1 and t4 are under t0; t2 and t3 under t1.
  const all = [
    task('t0', 0, null),
    task('t1', 1, 't0'),
    task('t2', 2, 't1'),
    task('t3', 3, 't1'),
    task('t4', 5, 't0'),
  ]
  const read = Tasks.reduce(
    { remote: Remote.initial },
    {
      _tag: 'ReadReceived',
      requests: all.map(row => ({ entity: 'Task', id: row.id, fields: Object.keys(row.values) })),
      result: { settled: [], entities: all },
      now: 0,
    },
  )
  const listed = Tasks.reduce(read, {
    _tag: 'ConnectionMerged',
    connection: open.ref.identity,
    page: {
      edges: ['t1', 't2', 't3', 't4'].map(id => ({
        key: `Task:${id}`,
        ref: { entity: 'Task', id },
      })),
      start: { _tag: 'Terminal' },
      end: { _tag: 'Terminal' },
    },
  })
  const finishing = Tasks.mutate(
    listed,
    Finish,
    { id: 't1', rank: 9 },
    { requestId: 'finish', optimistic: [Remote.patch(Task, 't1', { done: true, rank: 9 })] },
  ).model

  it('takes out the rows it reaches, and moves its own by the order', () => {
    expect(shown(listed, open)).toEqual(['t1', 't2', 't3', 't4'])
    expect(shown(finishing, open)).toEqual(['t4', 't1'])
  })

  it('keeps both once answered, and fetches the list again', () => {
    const answered = Tasks.reduce(finishing, {
      _tag: 'MutationSucceeded',
      requestId: 'finish',
      entities: [{ entity: 'Task', id: 't1', values: { done: true, rank: 9 } }],
      now: 1,
    })
    expect(shown(answered, open)).toEqual({ refreshing: ['t4', 't1'] })
  })

  it('places a row an answer makes once, though it also reaches other rows', () => {
    const answered = Tasks.reduce(listed, {
      _tag: 'MutationSucceeded',
      requestId: 'add',
      entities: [task('t5', 4, 't0')],
      now: 1,
    })
    expect(shown(answered, open)).toEqual({ refreshing: ['t1', 't2', 't3', 't5', 't4'] })
  })
})
