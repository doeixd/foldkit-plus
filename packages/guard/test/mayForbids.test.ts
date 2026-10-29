/**
 * A held `may` refuses, where a write is made, what it says no to
 * (operations-phase7-DESIGN §11): the row's `Update` or `Delete`, a written
 * member's own rule, a relinked relation's `Link` or `Unlink`, each over the
 * row as read. What it does not name, or a `may` not held, refuses nothing.
 */
import { Option, Schema } from 'effect'
import { Entity, Expr, Relation, Write } from 'foldkit-entity'
import { forbiddenByWrite, type EntityStore } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { Guards, type MayAnswer } from '../src/index.js'

const Fields = {
  User: Entity.define('User', Schema.Struct({ id: Schema.String })),
  Post: Entity.define(
    'Post',
    Schema.Struct({ id: Schema.String, body: Schema.String, pinned: Schema.Boolean }),
  ),
}
const Related = Entity.relate(Fields, { Post: { author: Relation.one(Fields.User) } })
const G = Guards.declare(
  'Blog',
  Schema.Struct({ id: Schema.String }),
  guard => ({
    isAuthor: guard.row(Related.Post, () =>
      Expr.eq(Related.Post.relations.author, Expr.viewer(Related.User)),
    ),
  }),
  { key: user => user.id, unguarded: 'deny', viewer: Related.User },
)
const Post = Related.Post.pipe(Guards.attach(G, { row: { Write: [G.isAuthor] } }), Guards.may)

const Edit = Write.update(
  Entity.input(Post, Schema.Struct({ id: Schema.String, body: Schema.String })),
  { id: 'id' },
)
const Pin = Write.update(
  Entity.input(Post, Schema.Struct({ id: Schema.String, pinned: Schema.Boolean })),
  { id: 'id' },
)
const Hand = Write.update(
  Entity.input(Post, Schema.Struct({ id: Schema.String, authorId: Schema.String }), {
    authorId: Relation.input(Post.relations.author),
  }),
  { id: 'id' },
)
const Drop = Write.delete(Entity.input(Post, Schema.Struct({ id: Schema.String })), {
  id: 'id',
})
const Add = Write.insert(
  Entity.input(
    Post,
    Schema.Struct({ id: Schema.String, body: Schema.String, pinned: Schema.Boolean }),
  ),
  { id: 'id' },
)

const allowed: MayAnswer = {
  row: { Update: true, Delete: true },
  reasons: {},
  members: {},
  relations: {},
}

/** The store holding p1 with `may` as the server answered it, or without it. */
const holding = (may: Option.Option<MayAnswer>): EntityStore => ({
  'Post:p1': {
    values: {
      id: 'p1',
      body: 'Hello',
      ...Option.match(may, { onNone: () => ({}), onSome: held => ({ may: held }) }),
    },
    present: new Set(['id', 'body', ...(Option.isSome(may) ? ['may'] : [])]),
    stale: new Set(),
    unavailable: new Set(),
    tombstone: false,
    updatedAt: 0,
    windows: {},
  },
})
const held = (may: Partial<MayAnswer>) => holding(Option.some({ ...allowed, ...may }))

describe('a write a held may says no to', () => {
  it.each([
    {
      what: "an edit, where the row's Update is refused, with the explain's words",
      write: Edit,
      input: { id: 'p1', body: 'Mine now' },
      may: {
        row: { Update: false, Delete: true },
        reasons: { Update: 'Only its author may edit it.' },
      },
      reason: Option.some('Only its author may edit it.'),
    },
    {
      what: 'a delete, where the row’s Delete is refused',
      write: Drop,
      input: { id: 'p1' },
      may: { row: { Update: true, Delete: false } },
      reason: Option.none(),
    },
    {
      what: 'a write of a member its own rule refuses',
      write: Pin,
      input: { id: 'p1', pinned: true },
      may: { members: { pinned: false } },
      reason: Option.none(),
    },
    {
      what: 'a link of a relation its Link refuses',
      write: Hand,
      input: { id: 'p1', authorId: 'grace' },
      may: { relations: { author: { Link: false, Unlink: true } } },
      reason: Option.none(),
    },
  ])('is refused: $what', ({ write, input, may, reason }) => {
    expect(forbiddenByWrite(write, input, undefined, held(may))).toEqual(Option.some({ reason }))
  })

  it.each([
    { what: 'every part allowed', write: Edit, input: { id: 'p1', body: 'x' }, store: held({}) },
    {
      what: 'a member it names no rule for',
      write: Edit,
      input: { id: 'p1', body: 'x' },
      store: held({ members: { pinned: false } }),
    },
    {
      what: 'a Delete refused, for an edit',
      write: Edit,
      input: { id: 'p1', body: 'x' },
      store: held({ row: { Update: true, Delete: false } }),
    },
    {
      what: 'an Unlink refused, for a link',
      write: Hand,
      input: { id: 'p1', authorId: 'grace' },
      store: held({ relations: { author: { Link: true, Unlink: false } } }),
    },
    {
      what: 'no may held',
      write: Edit,
      input: { id: 'p1', body: 'x' },
      store: holding(Option.none()),
    },
    {
      what: 'a row not held',
      write: Edit,
      input: { id: 'p9', body: 'x' },
      store: held({ row: { Update: false } }),
    },
    {
      what: 'an insert, which finds no row',
      write: Add,
      input: { id: 'p1', body: 'x', pinned: false },
      store: held({ row: { Update: false, Delete: false } }),
    },
  ])('is not refused: $what', ({ write, input, store }) => {
    expect(forbiddenByWrite(write, input, undefined, store)).toEqual(Option.none())
  })
})
