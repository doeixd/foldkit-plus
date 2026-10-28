/**
 * What the server chooses when a row is created, declared once on the Entity
 * (`Entity.stamps`), and what every write of it then follows: an insert
 * stamps it, and no input sets it.
 */
import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Entity, Relation, Stamp, Write, type EntityStamps } from '../src/index.js'

const Team = Entity.define('Team', Schema.Struct({ id: Schema.String }))
const User = Entity.define('User', Schema.Struct({ id: Schema.String }))
const PostFields = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    body: Schema.String,
    authorId: Schema.String,
    createdAt: Schema.Number,
  }),
)
const Blog = Entity.relate(
  { Team, User, Post: PostFields },
  { Post: { author: Relation.one(User), readers: Relation.many(User) } },
)
const Post = Blog.Post.pipe(
  Entity.stamps({ authorId: Stamp.viewer, createdAt: Stamp.clock, author: Stamp.viewer }),
)

const NewPost = Entity.input(Post, Schema.Struct({ id: Schema.String, body: Schema.String }))
const PostChirp = Write.insert(NewPost, { id: 'id' })
const stamping = (stamps: EntityStamps<typeof Blog.Post>) => () =>
  Blog.Post.pipe(Entity.stamps(stamps))

const you = { entity: 'User', id: 'you' }

describe('Entity.stamps', () => {
  it('is kept through the steps after it', () => {
    expect(Post.pipe(Entity.annotate(Post.metadata)).stamps).toEqual(Post.stamps)
  })

  it('refuses, where it is declared, a member that cannot hold its stamp', () => {
    // @ts-expect-error the id is the client's to name
    expect(stamping({ id: Stamp.viewer })).toThrow('stamps the id')
    // @ts-expect-error the viewer's id is text
    expect(stamping({ createdAt: Stamp.viewer })).toThrow('not stored as text')
    // @ts-expect-error the clock is a number
    expect(stamping({ authorId: Stamp.clock })).toThrow('not stored as a number')
    // @ts-expect-error a relation points at the viewer
    expect(stamping({ author: Stamp.clock })).toThrow('stamps the relation "author" with the clock')
    // @ts-expect-error a many relation points at no one row
    expect(stamping({ readers: Stamp.viewer })).toThrow('stamps "readers", a many relation')
    // @ts-expect-error no such member
    expect(stamping({ nobody: Stamp.viewer })).toThrow('stamps "nobody", which is not a field')
  })

  it('refuses a member stamped twice', () => {
    expect(() => Post.pipe(Entity.stamps({ createdAt: Stamp.clock }))).toThrow(
      '"createdAt" is stamped already',
    )
  })
})

describe('a write of a stamped Entity', () => {
  it('inserts each stamped member besides what the input sets', () => {
    expect(Write.writes(PostChirp).map(member => member.key)).toEqual([
      'body',
      'authorId',
      'createdAt',
      'author',
    ])
  })

  it('stamps the viewer and the clock, encoded as the store holds them', () => {
    expect(Write.stamp(PostChirp, { viewer: Option.some(you), now: Option.some(1_000) })).toEqual({
      values: { authorId: 'you', createdAt: 1_000 },
      links: { author: Option.some(you) },
      unknown: [],
    })
  })

  it('names a stamp it has nothing to fill from', () => {
    expect(Write.stamp(PostChirp, { viewer: Option.none(), now: Option.none() })).toEqual({
      values: {},
      links: {},
      unknown: ['authorId', 'createdAt', 'author'],
    })
  })

  it('points a relation only at a viewer of the Entity it points at', () => {
    expect(
      Write.stamp(PostChirp, {
        viewer: Option.some({ entity: 'Team', id: 't1' }),
        now: Option.some(1),
      }),
    ).toMatchObject({ links: {}, unknown: ['author'] })
  })

  it('counts the stamps as setting something on an insert whose input sets nothing', () => {
    const Bare = Schema.Struct({ id: Schema.String })
    expect(() => Write.insert(Entity.input(Blog.Post, Bare), { id: 'id' })).toThrow(
      'it sets no field',
    )
    expect(() => Write.insert(Entity.input(Post, Bare), { id: 'id' })).not.toThrow()
  })

  it('stamps nothing on an update or a delete', () => {
    const Edit = Entity.input(Post, Schema.Struct({ id: Schema.String, body: Schema.String }))
    expect(Write.update(Edit, { id: 'id' }).stamps).toEqual([])
    const Remove = Entity.input(Post, Schema.Struct({ id: Schema.String }))
    expect(Write.delete(Remove, { id: 'id' }).stamps).toEqual([])
  })

  it('refuses an input that sets a stamped field or link, on any write', () => {
    const Named = Schema.Struct({ id: Schema.String, body: Schema.String, authorId: Schema.String })
    expect(() => Write.insert(Entity.input(Post, Named), { id: 'id' })).toThrow(
      '"authorId" is stamped when a row is created',
    )
    expect(() => Write.update(Entity.input(Post, Named), { id: 'id' })).toThrow(
      '"authorId" is stamped when a row is created',
    )
    const Linked = Entity.input(Post, Schema.Struct({ id: Schema.String, userId: Schema.String }), {
      userId: 'author',
    })
    expect(() => Write.update(Linked, { id: 'id' })).toThrow(
      '"author" is stamped when a row is created',
    )
  })
})
