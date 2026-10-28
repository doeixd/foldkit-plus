/**
 * What the write's context sets, declared once on the Entity (`Entity.sets`),
 * and what every write of it then follows: an insert sets every such member,
 * an update those set `on: 'write'`, and no input sets one.
 * operations-phase3-DESIGN.
 */
import { Effect, Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Derived,
  Entity,
  Expr,
  Held,
  Relation,
  Write,
  type AnyWrite,
  type EntitySets,
  type ExprContext,
} from '../src/index.js'

const Team = Entity.define('Team', Schema.Struct({ id: Schema.String }))
const User = Entity.define('User', Schema.Struct({ id: Schema.String }))
const PostFields = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    body: Schema.String,
    authorId: Schema.String,
    createdAt: Schema.Number,
    editedAt: Schema.Number,
    // Who last edited it, if anyone: a field that holds a null.
    editorId: Schema.NullOr(Schema.String),
  }),
)
const Blog = Entity.relate(
  { Team, User, Post: PostFields },
  {
    Post: {
      author: Relation.one(User),
      editor: Relation.one(User, { optional: true }),
      readers: Relation.many(User),
    },
  },
)
const Post = Blog.Post.pipe(
  Entity.sets(
    { authorId: Expr.viewer(User), createdAt: Expr.now, author: Expr.viewer(User) },
    { on: 'create' },
  ),
  Entity.sets(
    { editedAt: Expr.now, editorId: Expr.viewer(User), editor: Expr.viewer(User) },
    { on: 'write' },
  ),
)

const NewPost = Entity.input(Post, Schema.Struct({ id: Schema.String, body: Schema.String }))
const PostChirp = Write.insert(NewPost, { id: 'id' })
const EditPost = Write.update(NewPost, { id: 'id' })
const setting = (values: EntitySets<typeof Blog.Post>) => () =>
  Blog.Post.pipe(Entity.sets(values, { on: 'create' }))

const you = { entity: 'User', id: 'you' }
/** What the context sets, with no row held to read a path from. */
const valuesOf = (write: AnyWrite, by: ExprContext) =>
  Effect.runSync(Write.contextValues(write, by, () => Effect.succeed(Held.unheld('no row'))))
const at = (viewer: Option.Option<{ entity: string; id: string }>, now: Option.Option<number>) => ({
  viewer,
  now,
})

describe('Entity.sets', () => {
  it('is kept through the steps after it', () => {
    expect(Post.pipe(Entity.annotate(Post.metadata)).sets).toEqual(Post.sets)
    expect(Post.sets.createdAt?.on).toBe('create')
    expect(Post.sets.editedAt?.on).toBe('write')
  })

  it('refuses, where it is declared, a member that cannot hold its value', () => {
    // @ts-expect-error the id is the client's to name
    expect(setting({ id: Expr.viewer(User) })).toThrow('sets the id')
    // @ts-expect-error the viewer's id is text
    expect(setting({ createdAt: Expr.viewer(User) })).toThrow('not stored as text')
    // @ts-expect-error the time is a number
    expect(setting({ authorId: Expr.now })).toThrow('not stored as a number')
    // @ts-expect-error a relation points at the viewer
    expect(setting({ author: Expr.now })).toThrow(
      'sets the relation "author" to what is not Expr.viewer(User)',
    )
    // @ts-expect-error a relation points at the viewer of its own target
    expect(setting({ author: Expr.viewer(Team) })).toThrow('to what is not Expr.viewer(User)')
    // @ts-expect-error a many relation points at no one row
    expect(setting({ readers: Expr.viewer(User) })).toThrow('sets "readers", a many relation')
    // @ts-expect-error no such member
    expect(setting({ nobody: Expr.now })).toThrow('sets "nobody", which is not a field')
    // @ts-expect-error a value from the input is a computed assignment
    expect(setting({ body: Expr.input('body', Schema.String) })).toThrow(
      "no value of the write's context",
    )
  })

  it('refuses a derived member, which an interpreter supplies', () => {
    const Scored = Blog.Post.pipe(Entity.derived({ score: Derived.make(Schema.Number) }))
    // @ts-expect-error a derived member is no field
    expect(() => Scored.pipe(Entity.sets({ score: Expr.now }, { on: 'create' }))).toThrow(
      'sets "score", which is not a field or relation',
    )
  })

  it('refuses a member set twice, and a write it does not name', () => {
    expect(() => Post.pipe(Entity.sets({ createdAt: Expr.now }, { on: 'write' }))).toThrow(
      '"createdAt" is set already',
    )
    expect(() =>
      // @ts-expect-error a delete sets nothing
      Blog.Post.pipe(Entity.sets({ createdAt: Expr.now }, { on: 'delete' })),
    ).toThrow("say on: 'create' or on: 'write'")
  })
})

describe('a write of an Entity with context sets', () => {
  it('inserts every member set, besides what the input sets', () => {
    expect(Write.writes(PostChirp).map(member => member.key)).toEqual([
      'body',
      'authorId',
      'createdAt',
      'author',
      'editedAt',
      'editorId',
      'editor',
    ])
  })

  it("updates only those set on: 'write'", () => {
    expect(EditPost.context.map(set => set.member.key)).toEqual(['editedAt', 'editorId', 'editor'])
    const Remove = Entity.input(Post, Schema.Struct({ id: Schema.String }))
    expect(Write.delete(Remove, { id: 'id' }).context).toEqual([])
  })

  it('comes to the viewer and the time, encoded as the store holds them', () => {
    expect(valuesOf(EditPost, at(Option.some(you), Option.some(1_000)))).toEqual({
      values: { editedAt: 1_000, editorId: 'you' },
      links: { editor: Option.some(you) },
      unfilled: [],
    })
  })

  it('names a member it has no value for, or a null the member cannot hold', () => {
    expect(valuesOf(PostChirp, at(Option.none(), Option.none()))).toEqual({
      // A visitor is a null: what holds one takes it.
      values: { editorId: null },
      links: { editor: Option.none() },
      unfilled: ['authorId', 'createdAt', 'author', 'editedAt'],
    })
  })

  it('points a relation only at a viewer of the Entity it points at', () => {
    expect(
      valuesOf(PostChirp, at(Option.some({ entity: 'Team', id: 't1' }), Option.some(1))),
    ).toMatchObject({ links: { editor: Option.none() }, unfilled: ['authorId', 'author'] })
  })

  it('counts the context as setting something on a write whose input sets nothing', () => {
    const Bare = Entity.input(Post, Schema.Struct({ id: Schema.String }))
    expect(() =>
      Write.insert(Entity.input(Blog.Post, Schema.Struct({ id: Schema.String })), { id: 'id' }),
    ).toThrow('it sets no field')
    expect(() => Write.insert(Bare, { id: 'id' })).not.toThrow()
    expect(() => Write.update(Bare, { id: 'id' })).not.toThrow()
  })

  it('refuses an input that sets, links, moves or computes a member the context sets', () => {
    const Named = Schema.Struct({ id: Schema.String, body: Schema.String, authorId: Schema.String })
    for (const declare of [Write.insert, Write.update])
      expect(() => declare(Entity.input(Post, Named), { id: 'id' })).toThrow(
        '"authorId" is set by the write\'s context (Entity.sets)',
      )
    const Linked = Entity.input(Post, Schema.Struct({ id: Schema.String, userId: Schema.String }), {
      userId: 'author',
    })
    expect(() => Write.update(Linked, { id: 'id' })).toThrow(
      '"author" is set by the write\'s context',
    )
    const Moved = Entity.input(Post, Schema.Struct({ id: Schema.String, by: Schema.Number }), {
      by: Entity.unmapped,
    })
    expect(() => Write.update(Moved, { id: 'id', increment: { editedAt: 'by' } })).toThrow(
      '"editedAt" is set by the write\'s context',
    )
  })
})
