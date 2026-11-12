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
  forgetRemote,
  isRemoteMessage,
  type RemoteMessage,
} from '../src/index.js'
import { noKept } from '../src/kept.js'
import { layers } from '../src/layers.js'
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

  // The answer's values predate Eve, but arrive after Eve's event, and nothing in
  // an answer says where it falls in the stream (`MutationResult` carries no
  // position, #485). The base, as the stream left it (Eve), differs from the
  // answer's Grace, and the stream wrote while this write was pending: the
  // answer's value is written, as ever, and the field is read again, since only
  // a read says which is newer (#499).
  it('reads the field again when a late answer disagrees with a newer live patch', () => {
    const model = answeredAt(3).reduce(Data.reduce, written)
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

  it.each([
    // No patch while the write was pending: the ordinary answer reads nothing again.
    ['a quiet stream', [] as ReadonlyArray<RemoteMessage>, false],
    // The stream's last word is the answer's own value: nothing to settle.
    ['a stream that sent the write itself', [patched('Ada', 1), patched('Grace', 2)], false],
    // A coalescing stream passed the write without ever sending its value.
    ['a stream that coalesced past the write', [patched('Eve', 1)], true],
    ['a stream still behind the write', [patched('Ada', 1)], true],
  ])('plans a read after the answer for %s: %s', (_name, before, planned) => {
    const model = [...before, answer].reduce(Data.reduce, written)
    expect(Data.plan(model, user)).toEqual(planned ? [asked('u1')] : [])
  })

  it('does not read again for a patch older than its own request', () => {
    const late = rename(Data.reduce(rename(known, 'a', 'Grace'), patched('Eve', 1)), 'b', 'Hopper')
    // `b` started after Eve was heard, so Eve is no race for it, as `a`'s answer is.
    const model = Data.reduce(late, succeeded('b', 'Hopper'))
    expect(Data.plan(model, user)).toEqual([])
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

describe('a Surface left mid-flight beside another that reads the same row', () => {
  const active = {
    page: Data.active('page', (model: Model) => (model.shown ? Option.some(user) : Option.none())),
    other: Data.active('other', () => Option.some(user)),
    elsewhere: Data.active('elsewhere', () => Option.some(userOf('u2'))),
  }
  const update = (model: Model, message: Message): Update.Return<Model, Message, RemoteClient> =>
    isRemoteMessage(message)
      ? { model: Data.reduce(model, message) }
      : Own.match(message, {
          Closed: () => ({ model: { ...model, shown: false } }),
          Opened: () => ({ model: { ...model, shown: true } }),
          Refreshed: () => ({ model }),
        })
  const client: RemoteClient['Service'] = {
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

  // The frame after `Closed` reads `Loading` for the left Surface's row until
  // its ReadAbandoned lands. Only a reader no active entry asks for can see a
  // mark that nothing is waiting on there: a reader that does ask is itself
  // waiting on the row, so `Loading` is true of it, and ReadAbandoned keeps
  // the mark while it owns it.
  it('keeps the other reader of the row, and a different row, Loading and answerable throughout', async () => {
    const trace = await Trace.run(Data, {
      start,
      update,
      active,
      client,
      steps: [Message.Closed(), Respond.read(User, 'u1'), Respond.read(User, 'u2')],
    })
    const after = trace.entries.findIndex(({ message }) => message._tag === 'Closed')
    const frames = trace.entries
      .slice(after)
      .map(({ message, model }) => [
        message._tag,
        user.read(model)._tag,
        userOf('u2').read(model)._tag,
      ])
    expect(frames).toEqual([
      ['Closed', 'Loading', 'Loading'],
      ['ReadAbandoned', 'Loading', 'Loading'],
      ['ReadReceived', 'Ready', 'Loading'],
      ['ReadReceived', 'Ready', 'Ready'],
    ])
    expect(trace.pending).toEqual([])
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
  it('shows the layer over the base the moment it starts', () => {
    expect(count(liked)).toBe(11)
  })

  // The write's own echo arrives before its answer: the base moves to 11, and the
  // layer resolves over the 10 the base held before the stream wrote, not over
  // the 11, which would show 12 until the answer (#498). `Data.confirmed` is
  // the stream's value in every frame.
  const likesPatched = (value: number, cursor: number, now = 10 + cursor): RemoteMessage => ({
    _tag: 'LiveReceived',
    stream: 's',
    event: {
      _tag: 'EntityPatched',
      cursor,
      ref: { entity: 'Post', id: 'p1' },
      values: { likes: value },
      changed: ['likes'],
    },
    now,
  })
  const failedLike = (requestId: string): RemoteMessage => ({
    _tag: 'MutationFailed',
    requestId,
    error: { _tag: 'RemoteUnreachable', message: 'down' },
    operation: requestId,
  })
  const noLikes = (requestId: string): RemoteMessage => ({
    _tag: 'MutationSucceeded',
    requestId,
    entities: [],
    now: 5,
  })
  const likesAnswered = (value: number, requestId = 'a'): RemoteMessage => ({
    _tag: 'MutationSucceeded',
    requestId,
    entities: [{ entity: 'Post', id: 'p1', values: { likes: value } }],
    now: 5,
  })
  const confirmedCount = (model: Model) => {
    const shown = Posts.confirmed(likes).read(model)
    return 'value' in shown ? shown.value.likes : shown._tag
  }
  const frames = (from: Model, messages: ReadonlyArray<RemoteMessage>) => {
    const out = [`${count(from)}/${confirmedCount(from)}`]
    let model = from
    for (const message of messages) {
      model = Posts.reduce(model, message)
      out.push(`${count(model)}/${confirmedCount(model)}`)
    }
    return out
  }

  it.each([
    // Its own echo: never above the server's count in any frame.
    ['its own echo', [likesPatched(11, 1), likesAnswered(11)], ['11/10', '11/11', '11/11']],
    // Someone else's like, then the echo: the other like shows when the answer lands.
    [
      'another like, then its own echo',
      [likesPatched(11, 1), likesPatched(12, 2), likesAnswered(12)],
      ['11/10', '11/11', '11/12', '12/12'],
    ],
    // The answer comes first: nothing was patched, so nothing is kept.
    ['no patch', [likesAnswered(11)], ['11/10', '11/11']],
  ])('shows %s', (_name, messages, expected) => {
    expect(frames(liked, messages)).toEqual(expected)
  })

  it('shows the base at once when the write fails', () => {
    const echoed = Posts.reduce(liked, likesPatched(11, 1))
    expect(count(Posts.reduce(echoed, failedLike('a')))).toBe(11)
  })

  it('resolves two pending likes over the same kept value, and rebases when the first answers', () => {
    const both = Posts.mutate(
      liked,
      Like,
      { id: 'p1' },
      {
        requestId: 'b',
        optimistic: [{ entity: 'Post', id: 'p1', values: {}, adds: { likes: 1 } }],
      },
    ).model
    const echoed = Posts.reduce(both, likesPatched(11, 1))
    expect(count(both)).toBe(12)
    expect(count(echoed)).toBe(12)
    // The first fails: the second still shows its one over the 10 the stream moved on from.
    expect(count(Posts.reduce(echoed, failedLike('a')))).toBe(11)
    // The first is answered: its answer writes the field, and the second resolves over it.
    expect(count(Posts.reduce(echoed, likesAnswered(11)))).toBe(12)
  })

  // A write started after a patch cannot be that patch's echo (#513), and one
  // that does not move the field has nothing to double count.
  it('resolves a like started after a patch over the patch, though another write was pending', () => {
    const other = Posts.mutate(
      read,
      Like,
      { id: 'p1' },
      { requestId: 'other', optimistic: [{ entity: 'Post', id: 'p1', values: {} }] },
    ).model
    const patched = Posts.reduce(other, likesPatched(11, 1))
    expect(count(patched)).toBe(11)
    const later = Posts.mutate(
      patched,
      Like,
      { id: 'p1' },
      {
        requestId: 'b',
        optimistic: [{ entity: 'Post', id: 'p1', values: {}, adds: { likes: 1 } }],
      },
    ).model
    expect(count(later)).toBe(12)
    // The server's answer to it is 12, and the echo that follows is not counted twice.
    const echoed = Posts.reduce(later, likesPatched(12, 2))
    expect(count(echoed)).toBe(12)
  })

  describe('what is kept of the base', () => {
    const keptOf = (model: Model) => model.remote.kept.get('Post:p1')?.has('likes') ?? false
    const deleted: RemoteMessage = {
      _tag: 'LiveReceived',
      stream: 's',
      event: { _tag: 'EntityDeleted', cursor: 2, ref: { entity: 'Post', id: 'p1' } },
      now: 12,
    }
    const echoed = Posts.reduce(liked, likesPatched(11, 1))
    const second = Posts.mutate(
      echoed,
      Like,
      { id: 'p1' },
      {
        requestId: 'b',
        optimistic: [{ entity: 'Post', id: 'p1', values: {}, adds: { likes: 1 } }],
      },
    ).model

    it.each([
      ['is recorded by a patch while a write is pending', echoed, true],
      ['is not recorded when nothing is pending', Posts.reduce(read, likesPatched(11, 1)), false],
      ['goes when an answer writes the field', Posts.reduce(second, likesAnswered(11)), false],
      ['stays when an answer leaves the field alone', Posts.reduce(second, noLikes('a')), true],
      [
        'goes when the last pending write is answered without it',
        Posts.reduce(echoed, noLikes('a')),
        false,
      ],
      ['goes when the last pending write fails', Posts.reduce(echoed, failedLike('a')), false],
      ['stays when another write is still pending', Posts.reduce(second, failedLike('a')), true],
      ['goes when the stream deletes the row', Posts.reduce(echoed, deleted), false],
      ['goes on forget', { ...echoed, remote: forgetRemote(echoed.remote) } satisfies Model, false],
    ])('%s', (_name, model, kept) => {
      expect(keptOf(model)).toBe(kept)
    })

    it('shows another store when only the kept values differ', () => {
      const { entities, optimistic, kept } = echoed.remote
      const shown = (over: typeof kept) =>
        layers.visible(entities, optimistic, over, Option.none())['Post:p1']?.values['likes']
      expect([shown(kept), shown(noKept), shown(kept)]).toEqual([11, 12, 11])
    })

    it('resolves over the base once the kept value is older than the bound', () => {
      const late = Posts.reduce(echoed, likesPatched(12, 2, 11 + 60_000))
      // Kept again at the later patch, from the base then held (11): 11 + 1.
      expect(count(late)).toBe(12)
    })
  })
})
