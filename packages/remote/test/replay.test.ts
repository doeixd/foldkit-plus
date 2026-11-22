/**
 * A pending write replayed over a newer server value (`replay.ts`): the way
 * of writing decides. An `add` commutes with any change to its count, so an
 * answer that is the add replayed over the newer value settles it without a
 * second read; a `set` cannot be ordered against the newer value, so an
 * answer that disagrees reads the field again. A failed write of either way
 * is dropped with its layer, and the newer value shows.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Entity, Mutation, Remote, type RemoteMessage } from '../src/index.js'
import { live } from '../src/live.js'

const Post = Entity.make(
  'Post',
  Schema.Struct({ id: Schema.String, likes: Schema.Number, title: Schema.String }),
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

const asked = { entity: 'Post', id: 'p1', fields: ['likes', 'title'] }
const read = (values: Readonly<Record<string, unknown>>, now = 0): RemoteMessage => ({
  _tag: 'ReadReceived',
  requests: [asked],
  result: { entities: [{ entity: 'Post', id: 'p1', values }], settled: [] },
  now,
})
const start: Model = { remote: Remote.initial }
const known = Posts.reduce(start, read({ likes: 10, title: 'Draft' }))

const liked = Posts.mutate(
  known,
  Edit,
  { id: 'p1' },
  { requestId: 'a', optimistic: [{ entity: 'Post', id: 'p1', values: {}, adds: { likes: 1 } }] },
).model
const retitled = Posts.mutate(
  known,
  Edit,
  { id: 'p1' },
  { requestId: 'a', optimistic: [Post.patch('p1', { title: 'Mine' })] },
).model

const patched = (values: Readonly<Record<string, unknown>>, cursor: number): RemoteMessage => ({
  _tag: 'LiveReceived',
  stream: 's',
  event: {
    _tag: 'EntityPatched',
    cursor,
    ref: { entity: 'Post', id: 'p1' },
    values,
    changed: Object.keys(values),
  },
  now: 10 + cursor,
})
const answered = (values: Readonly<Record<string, unknown>>): RemoteMessage => ({
  _tag: 'MutationSucceeded',
  requestId: 'a',
  entities: [{ entity: 'Post', id: 'p1', values }],
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
    // Another like lands, then the answer: 12 is the add over 11, so it is the next value.
    ['a live patch', [patched({ likes: 11 }, 1), answered({ likes: 12 })]],
    ['a read answered beside it', [read({ likes: 11 }, 3), answered({ likes: 12 })]],
  ])('settles over %s without a second read', (_name, messages) => {
    expect(settle(liked, messages)).toEqual({
      tag: 'Ready',
      value: { likes: 12, title: 'Draft' },
      rereads: false,
    })
  })

  it('reads again an answer that is not the add over the newer value', () => {
    // Its own echo (11) and a later like (12) came first: the answer's 11 is older than the stream.
    const settled = settle(liked, [
      patched({ likes: 11 }, 1),
      patched({ likes: 12 }, 2),
      answered({ likes: 11 }),
    ])
    expect(settled).toMatchObject({ tag: 'Refreshing', rereads: true })
  })

  it('is undone by dropping it when it fails: the newer value shows, and nothing is read', () => {
    expect(settle(liked, [patched({ likes: 11 }, 1), failed])).toEqual({
      tag: 'Ready',
      value: { likes: 11, title: 'Draft' },
      rereads: false,
    })
  })
})

describe('a set pending under a newer value', () => {
  it('reads the field again when its answer disagrees, though the answer is its own value', () => {
    expect(
      settle(retitled, [patched({ title: 'Theirs' }, 1), answered({ title: 'Mine' })]),
    ).toEqual({ tag: 'Refreshing', value: { likes: 10, title: 'Mine' }, rereads: true })
  })

  it('shows the newer value when it fails, and reads nothing: the failed write never changed it', () => {
    expect(settle(retitled, [patched({ title: 'Theirs' }, 1), failed])).toEqual({
      tag: 'Ready',
      value: { likes: 10, title: 'Theirs' },
      rereads: false,
    })
  })
})
