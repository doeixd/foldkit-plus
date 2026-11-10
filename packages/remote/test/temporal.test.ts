/**
 * Temporal laws of Remote's state machine (#482): what a read shows, frame by
 * frame, while writes, answers, live events and refreshes arrive in every
 * order the protocol allows. The matrix of what each law is tested by lives
 * in `docs/design/482-temporal-laws-MATRIX.md`; these are the cases it found
 * missing. Each asserts every Model in between, the visible read beside what
 * the server confirmed, never only where it ends.
 */
import { Effect, Option, Schema, Stream } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Mutation,
  Remote,
  RemoteClient,
  RemotePolicy,
  isRemoteMessage,
  type RemoteMessage,
} from '../src/index.js'
import { live } from '../src/live.js'
import { Respond, Trace } from '../src/testing.js'

const User = Entity.make('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Rename = Mutation.make('Rename', {
  Input: { id: Schema.String, name: Schema.String },
  Output: { id: Schema.String },
})

const own = { Refreshed: { id: Schema.String }, Closed: {}, Opened: {} }
const Own = defineMessageUnion(own)
const Message = defineMessageUnion({ ...Remote.messages, ...own })
type Message = typeof Message.Type
const Model = Schema.Struct({ remote: Remote.Model, shown: Schema.Boolean })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message })
const Data = Remote.make({
  model: App.model.remote,
  entities: [User],
  mutations: [Rename],
  verifyPredictions: true,
})

const selection = User.select({ name: true })
const userOf = (id: string) => Data.get(selection, id)
const user = userOf('u1')
// Reading it live installs the live capability, which an answer's echo needs.
const watched = live(Data, selection, 'u1')

const start: Model = { remote: Remote.initial, shown: true }
const asked = (id: string) => ({ entity: 'User', id, fields: ['name'] })

/** `u1` read as Ada at time 0. */
const known: Model = Data.reduce(start, {
  _tag: 'ReadReceived',
  requests: [asked('u1')],
  result: { entities: [{ entity: 'User', id: 'u1', values: { name: 'Ada' } }], settled: [] },
  now: 0,
})

const rename = (model: Model, requestId: string, name: string): Model =>
  Data.mutate(
    model,
    Rename,
    { id: 'u1', name },
    { requestId, optimistic: [User.patch('u1', { name })] },
  ).model
const succeeded = (requestId: string, name: string): RemoteMessage => ({
  _tag: 'MutationSucceeded',
  requestId,
  entities: [{ entity: 'User', id: 'u1', values: { name } }],
  now: 5,
})
const failed = (requestId: string): RemoteMessage => ({
  _tag: 'MutationFailed',
  requestId,
  error: { _tag: 'RemoteUnreachable', message: 'down' },
  operation: requestId,
})
const patched = (name: string, cursor: number): RemoteMessage => ({
  _tag: 'LiveReceived',
  stream: 's',
  event: {
    _tag: 'EntityPatched',
    cursor,
    ref: { entity: 'User', id: 'u1' },
    values: { name },
    changed: ['name'],
  },
  now: 10 + cursor,
})

/** What one Model shows of `u1`: the read's tag, and its name as shown and as confirmed. */
interface Frame {
  readonly tag: string
  readonly visible: string
  readonly confirmed: string
}
const nameIn = (read: { readonly _tag: string; readonly value?: { readonly name: string } }) =>
  read.value === undefined ? read._tag : read.value.name
const frameOf = (model: Model): Frame => ({
  tag: user.read(model)._tag,
  visible: nameIn(user.read(model)),
  confirmed: nameIn(Data.confirmed(user).read(model)),
})
/** The frame at `from` and after each Message: nothing falls between samples. */
const replay = (from: Model, messages: ReadonlyArray<RemoteMessage>): ReadonlyArray<Frame> => {
  const frames = [frameOf(from)]
  let model = from
  for (const message of messages) {
    model = Data.reduce(model, message)
    frames.push(frameOf(model))
  }
  return frames
}
const shown = (frames: ReadonlyArray<Frame>) =>
  frames.map(({ visible, confirmed }) => `${visible}/${confirmed}`)

describe('two writes to one field, answered in either order, each succeeding or failing', () => {
  // `a` (Grace) starts before `b` (Hopper). The server applies them in that
  // order, so Hopper is the last word whenever b succeeds, and an earlier
  // edit still pending must not show over a later one the server confirmed.
  const started = rename(rename(known, 'a', 'Grace'), 'b', 'Hopper')
  const outcome = {
    a: { ok: succeeded('a', 'Grace'), ko: failed('a') },
    b: { ok: succeeded('b', 'Hopper'), ko: failed('b') },
  }
  // Frames as visible/confirmed: the start, then after each answer.
  const cases: ReadonlyArray<
    readonly [order: 'ab' | 'ba', a: 'ok' | 'ko', b: 'ok' | 'ko', frames: ReadonlyArray<string>]
  > = [
    ['ab', 'ok', 'ok', ['Hopper/Ada', 'Hopper/Grace', 'Hopper/Hopper']],
    ['ab', 'ok', 'ko', ['Hopper/Ada', 'Hopper/Grace', 'Grace/Grace']],
    ['ab', 'ko', 'ok', ['Hopper/Ada', 'Hopper/Ada', 'Hopper/Hopper']],
    ['ab', 'ko', 'ko', ['Hopper/Ada', 'Hopper/Ada', 'Ada/Ada']],
    ['ba', 'ok', 'ok', ['Hopper/Ada', 'Hopper/Hopper', 'Hopper/Hopper']],
    ['ba', 'ok', 'ko', ['Hopper/Ada', 'Grace/Ada', 'Grace/Grace']],
    ['ba', 'ko', 'ok', ['Hopper/Ada', 'Hopper/Hopper', 'Hopper/Hopper']],
    ['ba', 'ko', 'ko', ['Hopper/Ada', 'Grace/Ada', 'Ada/Ada']],
  ]

  it.each(cases)('answered %s, a %s and b %s', (order, a, b, frames) => {
    const messages = [...order].map(id => outcome[id as 'a' | 'b'][id === 'a' ? a : b])
    const recorded = replay(started, messages)
    expect(shown(recorded)).toEqual(frames)
    // Every frame holds a value: the read never blinks to Loading, Initial or Failed.
    expect(recorded.map(frame => frame.tag)).toEqual(['Ready', 'Ready', 'Ready'])
  })

  it('shows a later edit over an earlier answer, and an earlier edit never over a later answer', () => {
    // The two halves of the table, named: b's answer first leaves a's pending Grace hidden.
    expect(shown(replay(started, [outcome.b.ok]))).toEqual(['Hopper/Ada', 'Hopper/Hopper'])
    expect(shown(replay(started, [outcome.a.ok]))).toEqual(['Hopper/Ada', 'Hopper/Grace'])
  })

  it('keeps the earlier edit on a field the later answer did not write', () => {
    const Both = Entity.make(
      'Pair',
      Schema.Struct({ id: Schema.String, name: Schema.String, note: Schema.String }),
    )
    const Edit = Mutation.make('Edit', { Input: { id: Schema.String }, Output: {} })
    const Pairs = Remote.make({
      model: App.model.remote,
      entities: [Both],
      mutations: [Edit],
    })
    const pair = Pairs.get(Both.select({ name: true, note: true }), 'p1')
    const read = Pairs.reduce(start, {
      _tag: 'ReadReceived',
      requests: [{ entity: 'Pair', id: 'p1', fields: ['name', 'note'] }],
      result: {
        entities: [{ entity: 'Pair', id: 'p1', values: { name: 'Ada', note: 'old' } }],
        settled: [],
      },
      now: 0,
    })
    const first = Pairs.mutate(
      read,
      Edit,
      { id: 'p1' },
      { requestId: 'a', optimistic: [Both.patch('p1', { name: 'Grace', note: 'new' })] },
    ).model
    const second = Pairs.mutate(
      first,
      Edit,
      { id: 'p1' },
      { requestId: 'b', optimistic: [Both.patch('p1', { name: 'Hopper' })] },
    ).model
    const settled = Pairs.reduce(second, {
      _tag: 'MutationSucceeded',
      requestId: 'b',
      entities: [{ entity: 'Pair', id: 'p1', values: { name: 'Hopper' } }],
      now: 5,
    })
    // b settled the name alone: a's pending note stays, its name does not.
    expect(pair.read(settled)).toMatchObject({
      _tag: 'Ready',
      value: { name: 'Hopper', note: 'new' },
    })
  })
})

describe('a write answered while the stream still delivers what came before it', () => {
  // The server committed three things on one stream: another principal's
  // `Ada` (cursor 1), our write `Grace` (2) and a later `Eve` (3). Our answer
  // arrives at some point among the events; the write is pending until then.
  const written = rename(known, 'a', 'Grace')
  const events = [patched('Ada', 1), patched('Grace', 2), patched('Eve', 3)]
  const answer = succeeded('a', 'Grace')
  const answeredAt = (position: number) => [
    ...events.slice(0, position),
    answer,
    ...events.slice(position),
  ]

  it.each([
    // The answer first: the stream's stale `Ada` is not written over it, nor is `Grace` re-read.
    [0, ['Grace/Ada', 'Grace/Grace', 'Grace/Grace', 'Grace/Grace', 'Eve/Eve']],
    // A stale `Ada` lands on the base while the write is pending: the layer still wins.
    [1, ['Grace/Ada', 'Grace/Ada', 'Grace/Grace', 'Grace/Grace', 'Eve/Eve']],
    // The echo is already in when the answer comes: nothing is stale, and Eve follows.
    [2, ['Grace/Ada', 'Grace/Ada', 'Grace/Grace', 'Grace/Grace', 'Grace/Grace']],
  ])('answered after %i of the three events, never shows Ada', (position, frames) => {
    const recorded = replay(written, answeredAt(position))
    expect(shown(recorded)).toEqual(frames)
    // Visible is the write from the first frame to the last, until the stream moves on from it.
    expect(recorded.slice(0, 4).map(frame => frame.visible)).toEqual([
      'Grace',
      'Grace',
      'Grace',
      'Grace',
    ])
    // Once the answer is in, what the server confirmed is never Ada again.
    const at = position + 1
    expect(recorded.slice(at).map(frame => frame.confirmed)).not.toContain('Ada')
  })

  it('reads the field again when a patch after the answer is not the answer, and shows Refreshing meanwhile', () => {
    // Position 2: the echo (Grace) was heard before the answer; Eve after it
    // cannot be told from a stale patch, so it is read again, not written.
    const model = answeredAt(2).reduce(Data.reduce, written)
    expect(user.read(model)).toEqual({ _tag: 'Refreshing', value: { name: 'Grace' } })
    expect(Data.plan(model, user)).toEqual([asked('u1')])
    const reread = Data.reduce(model, {
      _tag: 'ReadReceived',
      requests: [asked('u1')],
      result: { entities: [{ entity: 'User', id: 'u1', values: { name: 'Eve' } }], settled: [] },
      now: 20,
    })
    expect(frameOf(reread)).toEqual({ tag: 'Ready', visible: 'Eve', confirmed: 'Eve' })
  })

  // The answer's values predate Eve, but arrive after Eve's event: nothing in
  // an answer says where it falls in the stream (`MutationResult` carries no
  // position, #485), so it overwrites the newer value and nothing asks again.
  // A demonstrated failure, kept so the matrix's claim is a test: when it
  // starts passing, the matrix row and this case change together.
  it.fails('does not let a late answer overwrite a newer live patch', () => {
    const recorded = replay(written, answeredAt(3))
    expect(recorded.at(-1)!.confirmed).toBe('Eve')
  })
})

describe('refreshing one read', () => {
  const Refresh = Remote.make({
    model: App.model.remote,
    entities: [User],
    verifyPredictions: true,
  })
  const A = App.surface('RefreshA', { model: () => ({ user: Refresh.get(selection, 'u1') }) })
  const B = App.surface('RefreshB', { model: () => ({ user: Refresh.get(selection, 'u2') }) })
  const active = { a: Surface.at(A, undefined), b: Surface.at(B, undefined) }
  const update = (model: Model, message: Message): Update.Return<Model, Message, RemoteClient> =>
    isRemoteMessage(message)
      ? { model: Refresh.reduce(model, message) }
      : Own.match(message, {
          Refreshed: ({ id }) => ({ model: Refresh.refresh(model, Refresh.get(selection, id)) }),
          Closed: () => ({ model }),
          Opened: () => ({ model }),
        })
  const server: RemoteClient['Service'] = {
    read: batch =>
      Effect.succeed({
        settled: [],
        entities: batch.requests.map(request => ({
          entity: request.entity,
          id: request.id,
          values: { name: `name of ${request.id}` },
        })),
      }),
    query: () => Effect.die('unused'),
    mutate: () => Effect.die('unused'),
    live: () => Stream.empty,
  }
  const startsOf = (trace: Trace<Model, Message>, id: string) =>
    trace.entries.filter(
      ({ message }) =>
        message._tag === 'ReadStarted' && message.requests.some(request => request.id === id),
    ).length

  it('asks the one again, and leaves the other read in flight where it is', async () => {
    const trace = await Trace.run(Refresh, {
      start,
      update,
      active,
      client: server,
      options: { policy: RemotePolicy.cacheFirst },
      steps: [Respond.read(User, 'u1'), Message.Refreshed({ id: 'u1' })],
    })
    // u2's read was never restarted: one start, one request still held.
    expect(startsOf(trace, 'u2')).toBe(1)
    expect(trace.pending.filter(held => held.includes('User:u2'))).toEqual(['read User:u2'])
    // u1 was asked again, and reads Refreshing from the refresh on, never Loading or Initial.
    expect(startsOf(trace, 'u1')).toBe(2)
    expect(trace.pending.filter(held => held.includes('User:u1'))).toEqual(['read User:u1'])
    expect(
      trace.entries.map(({ message, model }) => [
        message._tag,
        Refresh.get(selection, 'u1').read(model)._tag,
        Refresh.get(selection, 'u2').read(model)._tag,
      ]),
    ).toEqual([
      ['ReadStarted', 'Loading', 'Initial'],
      ['ReadStarted', 'Loading', 'Loading'],
      ['RetentionChanged', 'Loading', 'Loading'],
      ['ReadReceived', 'Ready', 'Loading'],
      ['Refreshed', 'Refreshing', 'Loading'],
      ['ReadStarted', 'Refreshing', 'Loading'],
    ])
  })
})

describe('a read whose Surface is left mid-flight', () => {
  const active = {
    page: Data.active('page', (model: Model) => (model.shown ? Option.some(user) : Option.none())),
  }
  const update = (model: Model, message: Message): Update.Return<Model, Message, RemoteClient> =>
    isRemoteMessage(message)
      ? { model: Data.reduce(model, message) }
      : Own.match(message, {
          Closed: () => ({ model: { ...model, shown: false } }),
          Opened: () => ({ model: { ...model, shown: true } }),
          Refreshed: () => ({ model }),
        })
  const server: RemoteClient['Service'] = {
    read: batch =>
      Effect.succeed({
        settled: [],
        entities: batch.requests.map(request => ({
          entity: request.entity,
          id: request.id,
          values: { name: 'Ada' },
        })),
      }),
    query: () => Effect.die('unused'),
    mutate: () => Effect.die('unused'),
    live: () => Stream.empty,
  }

  it('is abandoned: nothing is held, nothing reads Loading, and going back asks once and answers', async () => {
    const trace = await Trace.run(Data, {
      start,
      update,
      active,
      client: server,
      steps: [Message.Closed(), Message.Opened(), Respond.read(User, 'u1')],
    })
    // Frame by frame. The frame after `Closed` still reads Loading: the
    // Subscription catches up after it, and its ReadAbandoned takes the mark back.
    expect(
      trace.entries.map(({ message, model }) => [message._tag, user.read(model)._tag]),
    ).toEqual([
      ['ReadStarted', 'Loading'],
      ['RetentionChanged', 'Loading'],
      ['Closed', 'Loading'],
      ['ReadAbandoned', 'Initial'],
      ['RetentionChanged', 'Initial'],
      ['Opened', 'Initial'],
      ['ReadStarted', 'Loading'],
      ['RetentionChanged', 'Loading'],
      ['ReadReceived', 'Ready'],
    ])
    expect(trace.pending).toEqual([])
  })

  it('leaves a request held for the old Surface answerable by no one', async () => {
    const run = Trace.run(Data, {
      start,
      update,
      active,
      client: server,
      steps: [Message.Closed(), Respond.read(User, 'u1')],
    })
    await expect(run).rejects.toThrow('answers nothing: no such request is held. Held: none')
  })
})

describe('a live read whose Surface is left', () => {
  const entries = Data.subscriptions({
    page: Data.active('page', (model: Model) =>
      model.shown ? Option.some(watched) : Option.none(),
    ),
  })
  const opened: Array<unknown> = []
  const client: RemoteClient['Service'] = {
    read: () => Effect.die('unused'),
    query: () => Effect.die('unused'),
    mutate: () => Effect.die('unused'),
    live: request => {
      opened.push(request)
      return Stream.empty
    },
  }
  const run = (model: Model) =>
    Effect.runPromise(
      Stream.runDrain(
        entries['page.live'].dependenciesToStream(entries['page.live'].modelToDependencies(model)),
      ).pipe(Effect.provideService(RemoteClient, client)),
    )

  it('opens a stream while shown, and none once it is hidden', async () => {
    await run(start)
    expect(opened).toHaveLength(1)
    await run({ ...start, shown: false })
    expect(opened).toHaveLength(1)
  })
})

describe('a live patch of a field a pending write moves by an amount', () => {
  const Post = Entity.make('Post', Schema.Struct({ id: Schema.String, likes: Schema.Number }))
  const Like = Mutation.make('Like', { Input: { id: Schema.String }, Output: {} })
  const Posts = Remote.make({ model: App.model.remote, entities: [Post], mutations: [Like] })
  const likes = Posts.get(Post.select({ likes: true }), 'p1')
  live(Posts, Post.select({ likes: true }), 'p1')
  const read = Posts.reduce(start, {
    _tag: 'ReadReceived',
    requests: [{ entity: 'Post', id: 'p1', fields: ['likes'] }],
    result: { entities: [{ entity: 'Post', id: 'p1', values: { likes: 10 } }], settled: [] },
    now: 0,
  })
  const liked = Posts.mutate(
    read,
    Like,
    { id: 'p1' },
    {
      requestId: 'a',
      optimistic: [{ entity: 'Post', id: 'p1', values: {}, adds: { likes: 1 } }],
    },
  ).model
  const count = (model: Model) => {
    const shown = likes.read(model)
    return 'value' in shown ? shown.value.likes : shown._tag
  }
  const echo: RemoteMessage = {
    _tag: 'LiveReceived',
    stream: 's',
    event: {
      _tag: 'EntityPatched',
      cursor: 1,
      ref: { entity: 'Post', id: 'p1' },
      values: { likes: 11 },
      changed: ['likes'],
    },
    now: 11,
  }

  it('shows the layer over the base the moment it starts', () => {
    expect(count(liked)).toBe(11)
  })

  // The write's own echo arrives before its answer: the base moves to 11 and
  // the layer adds one again, so 12 shows until the answer. Recorded in
  // `377-439-440-remote-data-plane-DESIGN.md` section 2.3, where staging a
  // live patch under a pending relative layer is the owner's decision.
  // Absolute patches do not do this (the interleavings above). Passes the day
  // that is fixed; the matrix row changes with it.
  it.fails('does not count a write’s own live echo twice while it is pending', () => {
    expect(count(Posts.reduce(liked, echo))).toBe(11)
  })
})
