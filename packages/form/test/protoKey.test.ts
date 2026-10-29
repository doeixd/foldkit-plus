/**
 * A key named like an `Object.prototype` member is the form's own key: a
 * value or a check not given for it is not found on the prototype.
 */
import { Effect, Record, Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { Entity, Relation } from 'foldkit-entity'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { Form, Input } from '../src/index.js'

const ListModel = Schema.Struct({ items: Schema.Array(Schema.String) })
const List = Bundle.make({
  name: 'List',
  Model: ListModel,
  Message: defineMessageUnion({ Cleared: {} }),
  init: () => ({ model: { items: [] } }),
  update: () => ({ model: { items: [] } }),
})
const ListInput = Input.bundle('List', {
  bundle: List,
  value: (model: typeof ListModel.Type) => (model.items.length === 0 ? undefined : model.items),
  fill: (model, items) => ({ ...model, items }),
  settled: model => model,
})

describe.each(['__proto__', 'constructor', 'toString'] as const)('a key named %s', key => {
  // A stored document without the key. Typed, `{ title }` is refused for a key
  // named `constructor`: TypeScript reads `Object`'s member as the literal's.
  const stored = JSON.parse('{"title":"Filled"}')
  const Thing = Entity.define(
    'Thing',
    Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      ...Record.singleton(key, Schema.String),
    }),
  )
  const ThingInput = Entity.input(
    Thing,
    Schema.Struct({ title: Schema.String, ...Record.singleton(key, Schema.String) }),
  )

  it('keeps its draft through a fill that gives it nothing', () => {
    const ThingForm = Form.make('ThingForm', ThingInput)
    const typed = ThingForm.bundle.update(
      ThingForm.initial,
      ThingForm.Message.Changed({ key, value: 'mine' }),
      undefined,
    ).model
    // It has no check, so it is valid as typed.
    expect(ThingForm.field(typed, key)).toEqual({ _tag: 'Valid', value: 'mine' })
    const filled = ThingForm.fill(typed, stored).model
    expect(ThingForm.field(filled, key)).toEqual(ThingForm.field(typed, key))
  })

  it('follows again after a fill that gives it nothing', () => {
    const ThingForm = Form.make('ThingForm', ThingInput, {
      inputs: Record.singleton(
        key,
        Input.following('title', (title: string) => title),
      ),
    })
    expect(ThingForm.isFollowing(ThingForm.fill(ThingForm.initial, stored).model, key)).toBe(true)
  })

  it('keeps its rows through a fill that gives it nothing', () => {
    const Note = Entity.define('Note', Schema.Struct({ id: Schema.String, body: Schema.String }))
    const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String }))
    const Blog = Entity.relate(
      { Note, Post },
      { Post: Record.singleton(key, Relation.one(Note, { optional: true })) },
    )
    const NewNote = Entity.input(Blog.Note, Schema.Struct({ body: Schema.String }))
    const PostInput = Entity.input(
      Blog.Post,
      Schema.Struct({
        title: Schema.String,
        ...Record.singleton(key, Schema.NullOr(NewNote.schema)),
      }),
      Record.singleton(key, Relation.nested(Blog.Post.relations[key], NewNote)),
    )
    const PostForm = Form.make('PostForm', PostInput)
    const filled = PostForm.fill(PostForm.initial, stored).model
    expect(filled.rows[key]).toEqual(PostForm.initial.rows[key])
  })
})

// `__proto__` alone: for a key named `constructor` or `toString` TypeScript
// refuses checks that leave it out, reading `Object`'s member as theirs.
it('takes a check on another key while a Bundle edits a key named __proto__', () => {
  const ListThing = Entity.define(
    'ListThing',
    Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      ...Record.singleton('__proto__', Schema.Array(Schema.String)),
    }),
  )
  const input = Entity.input(
    ListThing,
    Schema.Struct({
      title: Schema.String,
      ...Record.singleton('__proto__', Schema.Array(Schema.String)),
    }),
  )
  expect(() =>
    Form.make('ListForm', input, {
      inputs: Record.singleton('__proto__', ListInput),
      checks: { title: () => Effect.succeed(undefined) },
    }),
  ).not.toThrow()
})
