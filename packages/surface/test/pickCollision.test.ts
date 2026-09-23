/**
 * Two fields with the same name at different paths.
 *
 * A picked field is named by its last key alone. Picking `post.id` and
 * `viewer.id` used to give one field `id`: `get` kept the viewer's and dropped
 * the post's, and `set` wrote the viewer's id into the post. Nothing failed.
 * Both are now refused when the projection is built.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { Projection, Surface } from '../src/index.js'

const Model = Schema.Struct({
  post: Schema.Struct({ id: Schema.String, title: Schema.String }),
  viewer: Schema.Struct({ id: Schema.String }),
})
const App = Surface.application({ Model, Message: defineMessageUnion({ Ping: {} }) })
const model = { post: { id: 'p1', title: 'Hello' }, viewer: { id: 'u1' } }

describe('Projection.pick', () => {
  it('refuses two fields that would be read under one name', () => {
    expect(() => Projection.pick(App.model.post.id, App.model.viewer.id)).toThrow(
      '"post.id" and "viewer.id" would both be read as "id"',
    )
  })

  it('keeps the same field picked twice once', () => {
    const twice = Projection.pick(App.model.post.id, App.model.post.id, App.model.post.title)

    expect(twice.get(model)).toEqual({ id: 'p1', title: 'Hello' })
    expect(twice.set(model, { id: 'p2', title: 'Hi' })).toEqual({
      post: { id: 'p2', title: 'Hi' },
      viewer: { id: 'u1' },
    })
  })
})

describe('Projection.compose', () => {
  it('refuses two parts that read different fields under one name', () => {
    expect(() =>
      Projection.compose(Projection.pick(App.model.post.id), Projection.pick(App.model.viewer.id)),
    ).toThrow('"post.id" and "viewer.id" would both be read as "id"')
  })

  it('still merges two parts that read the same field', () => {
    const merged = Projection.compose(
      Projection.pick(App.model.post.id),
      Projection.pick(App.model.post.id, App.model.post.title),
    )

    expect(merged.get(model)).toEqual({ id: 'p1', title: 'Hello' })
  })
})
