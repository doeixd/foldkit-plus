/**
 * A pending write replayed over a newer server value (`replay.ts`): the way
 * of writing decides. An `add` commutes with any change to its count, so an
 * answer that is the add replayed over the newer value, at the revision right
 * after it, settles it without a second read; one the revisions cannot place
 * there is read again. A `set` cannot be ordered against the newer value, so
 * an answer that disagrees reads the field again. A failed write of either
 * way is dropped with its layer, and the newer value shows.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Computation } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Entity, Mutation, Remote, type RemoteMessage } from '../src/index.js'
import { layers } from '../src/layers.js'
import { live } from '../src/live.js'

const Post = Entity.make(
  'Post',
  Schema.Struct({
    id: Schema.String,
    likes: Schema.Number,
    title: Schema.String,
    score: Schema.Number,
  }),
)
const Edit = Mutation.make('Edit', { Input: { id: Schema.String }, Output: {} })
const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Posts = Remote.make({ model: App.model.remote, entities: [Post], mutations: [Edit] })
const selection = Post.select({ likes: true, title: true })
const post = Posts.get(selection, 'p1')
// Reading it live installs the live capability, which a patch needs.
live(Posts, selection, 'p1')

// With no revision, the row is one a server that keeps none sent.
const revised = (revision?: number) => (revision === undefined ? {} : { revision })

const asked = { entity: 'Post', id: 'p1', fields: ['likes', 'title'] }
const read = (
  values: Readonly<Record<string, unknown>>,
  now: number,
  revision?: number,
): RemoteMessage => ({
  _tag: 'ReadReceived',
  requests: [asked],
  result: { entities: [{ entity: 'Post', id: 'p1', values, ...revised(revision) }], settled: [] },
  now,
})
const start: Model = { remote: Remote.initial }
const knownAt = (revision?: number) =>
  Posts.reduce(start, read({ likes: 10, title: 'Draft' }, 0, revision))
const known = knownAt(1)

const like = (from: Model) =>
  Posts.mutate(
    from,
    Edit,
    { id: 'p1' },
    { requestId: 'a', optimistic: [{ entity: 'Post', id: 'p1', values: {}, adds: { likes: 1 } }] },
  ).model
const liked = like(known)
const retitled = Posts.mutate(
  known,
  Edit,
  { id: 'p1' },
  { requestId: 'a', optimistic: [Post.patch('p1', { title: 'Mine' })] },
).model

const patched = (
  values: Readonly<Record<string, unknown>>,
  cursor: number,
  revision?: number,
): RemoteMessage => ({
  _tag: 'LiveReceived',
  stream: 's',
  event: {
    _tag: 'EntityPatched',
    cursor,
    ref: { entity: 'Post', id: 'p1' },
    values,
    changed: Object.keys(values),
    ...revised(revision),
  },
  now: 10 + cursor,
})
const answered = (values: Readonly<Record<string, unknown>>, revision?: number): RemoteMessage => ({
  _tag: 'MutationSucceeded',
  requestId: 'a',
  entities: [{ entity: 'Post', id: 'p1', values, ...revised(revision) }],
  now: 5,
})
const failed: RemoteMessage = {
  _tag: 'MutationFailed',
  requestId: 'a',
  error: { _tag: 'RemoteUnreachable', message: 'down' },
  operation: 'a',
}

const settle = (from: Model, messages: ReadonlyArray<RemoteMessage>) => {
  const model = messages.reduce(Posts.reduce, from)
  const shown = post.read(model)
  return {
    tag: shown._tag,
    value: 'value' in shown ? shown.value : undefined,
    rereads: Posts.plan(model, post).length > 0,
  }
}

describe('an add pending under a newer value', () => {
  it.each([
    // Another like lands at revision 2, then the answer at 3: 12 is the add over 11, right after it.
    ['a live patch', [patched({ likes: 11 }, 1, 2), answered({ likes: 12 }, 3)]],
    ['a read answered beside it', [read({ likes: 11 }, 3, 2), answered({ likes: 12 }, 3)]],
  ])('settles over %s without a second read', (_name, messages) => {
    expect(settle(liked, messages)).toEqual({
      tag: 'Ready',
      value: { likes: 12, title: 'Draft' },
      rereads: false,
    })
  })

  it.each([
    // Our like is the server's 12, then someone's unlike makes it 11, and the stream sends
    // only that: 12 is 11 plus the like, though the server holds 11. With no revision to
    // place it, an equal answer is no proof, and the count is read again.
    ['no revisions', like(knownAt()), [patched({ likes: 11 }, 1), answered({ likes: 12 })]],
    // Someone's like at 2, a title at 3, ours at 4: a step of two leaves room for a change between.
    [
      'revisions a change landed between',
      liked,
      [patched({ likes: 11 }, 1, 2), answered({ likes: 12 }, 4)],
    ],
    // Steps of a half: 2.5 is one after 1.5, and room for two changes.
    [
      'revisions that step by less than one',
      liked,
      [patched({ likes: 11 }, 1, 1.5), answered({ likes: 12 }, 2.5)],
    ],
    // The newer count came with no revision: the row's revision 1 says nothing of it.
    [
      'a newer value that came without one',
      liked,
      [patched({ likes: 11 }, 1), answered({ likes: 12 }, 2)],
    ],
  ])(
    'reads again an answer equal to the add over the newer value, with %s',
    (_n, from, messages) => {
      expect(settle(from, messages)).toMatchObject({ rereads: true })
    },
  )

  it('reads again an answer that is not the add over the newer value', () => {
    // Its own echo (11) and a later like (12) came first: the answer's 11 is older than the stream.
    const settled = settle(liked, [
      patched({ likes: 11 }, 1, 2),
      patched({ likes: 12 }, 2, 3),
      answered({ likes: 11 }, 2),
    ])
    expect(settled).toMatchObject({ tag: 'Refreshing', rereads: true })
  })

  it.each([
    // The read included our like: its answer is the read's count.
    ['one that includes the add', answered({ likes: 11 }, 2), 11],
    // Someone else's like: ours lands right after it.
    ['one that does not', answered({ likes: 12 }, 3), 12],
  ])(
    "shows a read's count as it is, since the read may include the add, then settles on %s",
    (_name, answer, settled) => {
      const during = Posts.reduce(liked, read({ likes: 11 }, 3, 2))
      expect(settle(during, [])).toEqual({
        tag: 'Ready',
        value: { likes: 11, title: 'Draft' },
        rereads: false,
      })
      expect(settle(during, [answer])).toEqual({
        tag: 'Ready',
        value: { likes: settled, title: 'Draft' },
        rereads: false,
      })
    },
  )

  it('works out a field computed from the count over the count as the read gave it', () => {
    const scored = Posts.mutate(
      known,
      Edit,
      { id: 'p1' },
      {
        requestId: 'a',
        optimistic: [
          {
            entity: 'Post',
            id: 'p1',
            values: {},
            adds: { likes: 1 },
            computes: { score: Computation.Field({ key: 'likes' }) },
          },
        ],
      },
    ).model
    const { entities, optimistic, kept } = Posts.reduce(scored, read({ likes: 11 }, 3, 2)).remote
    expect(layers.visible(entities, optimistic, kept, Option.none())['Post:p1']?.values).toEqual(
      expect.objectContaining({ likes: 11, score: 11 }),
    )
  })

  it('keeps showing the count as the read gave it while another add is still pending', () => {
    const both = Posts.mutate(
      liked,
      Edit,
      { id: 'p1' },
      {
        requestId: 'b',
        optimistic: [{ entity: 'Post', id: 'p1', values: {}, adds: { likes: 1 } }],
      },
    ).model
    // Someone else's like and our two: the read may include either of ours, or both.
    const during = Posts.reduce(both, read({ likes: 13 }, 3, 4))
    expect(settle(during, [])).toMatchObject({ value: { likes: 13 } })
    // The first's answer is 11 at revision 2: the read is newer and may still include the second.
    expect(settle(during, [answered({ likes: 11 }, 2)])).toMatchObject({ value: { likes: 13 } })
  })

  it('is undone by dropping it when it fails: the newer value shows, and nothing is read', () => {
    expect(settle(liked, [patched({ likes: 11 }, 1, 2), failed])).toEqual({
      tag: 'Ready',
      value: { likes: 11, title: 'Draft' },
      rereads: false,
    })
  })
})

describe('a set pending under a newer value', () => {
  it('reads the field again when its answer disagrees, though the answer is its own value', () => {
    expect(
      settle(retitled, [patched({ title: 'Theirs' }, 1, 2), answered({ title: 'Mine' }, 3)]),
    ).toEqual({ tag: 'Refreshing', value: { likes: 10, title: 'Mine' }, rereads: true })
  })

  it('shows the newer value when it fails, and reads nothing: the failed write never changed it', () => {
    expect(settle(retitled, [patched({ title: 'Theirs' }, 1, 2), failed])).toEqual({
      tag: 'Ready',
      value: { likes: 10, title: 'Theirs' },
      rereads: false,
    })
  })
})

describe('concurrent pending writes, slow answers, and multi-patch layers', () => {
  it('C2: settling one pending request preserves kept entries for other pending requests on the same field', () => {
    const reqA = Posts.mutate(
      known,
      Edit,
      { id: 'p1' },
      { requestId: 'reqA', optimistic: [Post.patch('p1', { title: 'C' })] },
    ).model
    const both = Posts.mutate(
      reqA,
      Edit,
      { id: 'p1' },
      { requestId: 'reqB', optimistic: [Post.patch('p1', { title: 'B' })] },
    ).model
    // Live patch 'C' lands while both reqA and reqB are pending.
    const afterPatch = Posts.reduce(both, patched({ title: 'C' }, 1, 2))
    // reqA settles matching 'C' (no reread), while reqB is still in flight.
    const afterA = Posts.reduce(afterPatch, {
      _tag: 'MutationSucceeded',
      requestId: 'reqA',
      entities: [{ entity: 'Post', id: 'p1', values: { title: 'C' }, revision: 2 }],
      now: 20,
    })
    // Late stale answer for reqB ('B') MUST still see that title moved while reqB was pending and schedule a reread.
    const afterB = settle(afterA, [
      {
        _tag: 'MutationSucceeded',
        requestId: 'reqB',
        entities: [{ entity: 'Post', id: 'p1', values: { title: 'B' }, revision: 1 }],
        now: 30,
      },
    ])
    expect(afterB).toMatchObject({ tag: 'Refreshing', rereads: true })
  })

  it('H7: a second read while pending shows its count, not the first read with the add on top', () => {
    // Each read may include the pending like, so each shows the server's count as it is.
    const afterRead1 = Posts.reduce(liked, read({ likes: 11 }, 10, 2))
    expect(post.read(afterRead1)).toMatchObject({ _tag: 'Ready', value: { likes: 11 } })
    const afterRead2 = Posts.reduce(afterRead1, read({ likes: 15 }, 20, 3))
    expect(post.read(afterRead2)).toMatchObject({ _tag: 'Ready', value: { likes: 15 } })
  })

  it('M3: revisions at or above Number.MAX_SAFE_INTEGER are not treated as rightAfter', () => {
    const maxRev = Number.MAX_SAFE_INTEGER
    const settled = settle(liked, [
      patched({ likes: 11 }, 1, maxRev),
      answered({ likes: 12 }, maxRev + 1),
    ])
    expect(settled).toMatchObject({ rereads: true })
  })

  it('M4: a layer with a set followed by an add on the same field does not falsely replay as a pure add', () => {
    const mixed = Posts.mutate(
      known,
      Edit,
      { id: 'p1' },
      {
        requestId: 'a',
        optimistic: [
          { entity: 'Post', id: 'p1', values: { likes: 50 } },
          { entity: 'Post', id: 'p1', values: {}, adds: { likes: 1 } },
        ],
      },
    ).model
    // Newer value is 11 at rev 2; answer is 12 at rev 3 (matches 11 + 1, but layer also had a set!).
    const settled = settle(mixed, [patched({ likes: 11 }, 1, 2), answered({ likes: 12 }, 3)])
    expect(settled).toMatchObject({ rereads: true })
  })

  it('C1 (TLC2): out-of-order server execution with revisions applies the higher revision instead of silently diverging', () => {
    // Client sends r1 (+1) then r2 (set 2). Server executes r2 (2, rev 2) then r1 (3, rev 3).
    const r1 = Posts.mutate(
      known,
      Edit,
      { id: 'p1' },
      {
        requestId: 'r1',
        optimistic: [{ entity: 'Post', id: 'p1', values: {}, adds: { likes: 1 } }],
      },
    ).model
    const both = Posts.mutate(
      r1,
      Edit,
      { id: 'p1' },
      { requestId: 'r2', optimistic: [Post.patch('p1', { likes: 2 })] },
    ).model
    const settled = settle(both, [
      patched({ likes: 2 }, 1, 2),
      {
        _tag: 'MutationSucceeded',
        requestId: 'r2',
        entities: [{ entity: 'Post', id: 'p1', values: { likes: 2 }, revision: 2 }],
        now: 20,
      },
      {
        _tag: 'MutationSucceeded',
        requestId: 'r1',
        entities: [{ entity: 'Post', id: 'p1', values: { likes: 3 }, revision: 3 }],
        now: 30,
      },
    ])
    expect(settled.value).toEqual({ likes: 3, title: 'Draft' })
  })

  it('H5: a stale read rejected by olderThanHeld does not pollute kept or suppress a pending add', () => {
    const rev2 = Posts.reduce(start, read({ likes: 11, title: 'Draft' }, 0, 2))
    const pending = like(rev2)
    expect(post.read(pending)).toMatchObject({ _tag: 'Ready', value: { likes: 12 } })
    const afterStale = Posts.reduce(pending, read({ likes: 10 }, 5, 1))
    expect(post.read(afterStale)).toMatchObject({ _tag: 'Ready', value: { likes: 12 } })
    expect(afterStale.remote.kept.size).toBe(0)
  })

  it('H6: out-of-order settle after a live patch does not double-count an earlier still-pending add', () => {
    const r1 = Posts.mutate(
      known,
      Edit,
      { id: 'p1' },
      {
        requestId: 'r1',
        optimistic: [{ entity: 'Post', id: 'p1', values: {}, adds: { likes: 1 } }],
      },
    ).model
    const both = Posts.mutate(
      r1,
      Edit,
      { id: 'p1' },
      {
        requestId: 'r2',
        optimistic: [{ entity: 'Post', id: 'p1', values: {}, adds: { likes: 1 } }],
      },
    ).model
    const afterPatch = Posts.reduce(both, patched({ likes: 11 }, 1, 2))
    // r2 (sent second) settles first with 12 (which already includes r1): UI must stay 12, not jump to 13.
    const afterR2 = Posts.reduce(afterPatch, {
      _tag: 'MutationSucceeded',
      requestId: 'r2',
      entities: [{ entity: 'Post', id: 'p1', values: { likes: 12 }, revision: 3 }],
      now: 20,
    })
    expect(post.read(afterR2)).toMatchObject({ _tag: 'Ready', value: { likes: 12 } })
  })

  it('M2: a read whose revision advanced while returning the same value (ABA) is still recorded in kept', () => {
    // Store at likes=10 rev 1; pending +1; server did +1 (rev 2) then -1 (rev 3) -> read returns 10 at rev 3.
    const afterAbaRead = Posts.reduce(liked, read({ likes: 10 }, 10, 3))
    // Unrevisioned stale answer 11 arrives -> must trigger a reread rather than silently sticking at 11.
    const settled = settle(afterAbaRead, [answered({ likes: 11 })])
    expect(settled).toMatchObject({ rereads: true })
  })
})
