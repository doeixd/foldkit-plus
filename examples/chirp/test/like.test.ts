/**
 * A heart pressed, as `update` takes it: the count and the heart move at once
 * from the declarations alone (`Derived.count`, `Derived.exists`), before the
 * server answers, and a second press takes back the like the first made.
 */
import { Option } from 'effect'
import { Entity } from 'foldkit-entity'
import { describe, expect, it } from 'vitest'
import { Data, Message, initial, update, type Model } from '../src/app.js'
import { Post } from '../src/guard.js'

/**
 * As you read them: p1 you liked, p2 you did not. No Like row is held. The
 * server's like of p1 has an id `likeOf` would not make, so taking it back must
 * read the id the post shows.
 */
const held: Model = Data.reduce(initial, {
  _tag: 'ReadReceived',
  requests: [
    { entity: 'Post', id: 'p1', fields: ['liked', 'likeCount'] },
    { entity: 'Post', id: 'p2', fields: ['liked', 'likeCount'] },
  ],
  result: {
    settled: [],
    entities: [
      { entity: 'Post', id: 'p1', values: { id: 'p1', liked: 'like-from-server', likeCount: 3 } },
      { entity: 'Post', id: 'p2', values: { id: 'p2', liked: null, likeCount: 2 } },
    ],
  },
  now: 0,
})

const Heart = Entity.select(Post, { liked: true, likeCount: true })
const heart = (model: Model, id: string) => {
  const read = Data.get(Heart, id).read(model)
  return read._tag === 'Ready'
    ? { pressed: Option.isSome(read.value.liked), count: read.value.likeCount }
    : read._tag
}
const press = (model: Model, postId: string) => update(model, Message.ClickedLike({ postId })).model

describe('a heart pressed', () => {
  it('shows your like at once', () => {
    expect(heart(press(held, 'p2'), 'p2')).toEqual({ pressed: true, count: 3 })
  })

  it('takes back a like the server gave, by the id the post shows', () => {
    expect(heart(press(held, 'p1'), 'p1')).toEqual({ pressed: false, count: 2 })
  })

  it('takes back, on a second press, the like the first made', () => {
    expect(heart(press(press(held, 'p2'), 'p2'), 'p2')).toEqual({ pressed: false, count: 2 })
  })
})
