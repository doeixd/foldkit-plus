/**
 * An insert's stamps: members set where it lands, never by its input, and what
 * they come to given a viewer and a clock reading.
 */
import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Entity, Relation, Stamp, Write, type WriteStamps } from '../src/index.js'

const Team = Entity.define('Team', Schema.Struct({ id: Schema.String }))
const User = Entity.define('User', Schema.Struct({ id: Schema.String }))
const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    body: Schema.String,
    authorId: Schema.String,
    createdAt: Schema.Number,
  }),
)
const Blog = Entity.relate(
  { Team, User, Post },
  { Post: { author: Relation.one(User), readers: Relation.many(User) } },
)

const NewPost = Entity.input(Blog.Post, Schema.Struct({ id: Schema.String, body: Schema.String }))
const insert = (stamps: WriteStamps<typeof Blog.Post>) =>
  Write.insert(NewPost, { id: 'id', stamps })

const you = { entity: 'User', id: 'you' }

describe('Write.insert stamps', () => {
  it('writes each stamped member besides what the input sets', () => {
    const write = insert({ authorId: Stamp.viewer, createdAt: Stamp.clock, author: Stamp.viewer })
    expect(Write.writes(write).map(member => member.key)).toEqual([
      'body',
      'authorId',
      'createdAt',
      'author',
    ])
  })

  it('stamps the viewer and the clock, encoded as the store holds them', () => {
    const write = insert({ authorId: Stamp.viewer, createdAt: Stamp.clock, author: Stamp.viewer })
    expect(Write.stamp(write, { viewer: Option.some(you), now: Option.some(1_000) })).toEqual({
      values: { authorId: 'you', createdAt: 1_000 },
      links: { author: Option.some(you) },
      unknown: [],
    })
  })

  it('names a stamp it has nothing to fill from', () => {
    const write = insert({ authorId: Stamp.viewer, createdAt: Stamp.clock, author: Stamp.viewer })
    expect(Write.stamp(write, { viewer: Option.none(), now: Option.none() })).toEqual({
      values: {},
      links: {},
      unknown: ['authorId', 'createdAt', 'author'],
    })
  })

  it('points a relation only at a viewer of the Entity it points at', () => {
    const write = insert({ author: Stamp.viewer })
    expect(
      Write.stamp(write, { viewer: Option.some({ entity: 'Team', id: 't1' }), now: Option.none() }),
    ).toEqual({ values: {}, links: {}, unknown: ['author'] })
  })

  it('counts as setting something on an insert whose input sets nothing', () => {
    const Bare = Entity.input(Blog.Post, Schema.Struct({ id: Schema.String }))
    expect(() => Write.insert(Bare, { id: 'id' })).toThrow('it sets no field')
    expect(() => Write.insert(Bare, { id: 'id', stamps: { createdAt: Stamp.clock } })).not.toThrow()
  })

  it('refuses a stamp of a member the input writes, where it is declared', () => {
    expect(() => insert({ body: Stamp.viewer })).toThrow(
      'stamps "body", which an input key also writes',
    )
  })

  // Each is refused by the type as well; the runtime refuses it as plain JavaScript would reach it.
  it('refuses a stamp of a member that cannot hold it, where it is declared', () => {
    // @ts-expect-error the id is the client's to name
    expect(() => insert({ id: Stamp.viewer })).toThrow('stamps the id')
    // @ts-expect-error the viewer's id is text
    expect(() => insert({ createdAt: Stamp.viewer })).toThrow('not stored as text')
    // @ts-expect-error the clock is a number
    expect(() => insert({ authorId: Stamp.clock })).toThrow('not stored as a number')
    // @ts-expect-error a relation points at the viewer
    expect(() => insert({ author: Stamp.clock })).toThrow(
      'stamps the relation "author" with the clock',
    )
    // @ts-expect-error a many relation points at no one row
    expect(() => insert({ readers: Stamp.viewer })).toThrow('stamps "readers", a many relation')
    // @ts-expect-error no such member
    expect(() => insert({ nobody: Stamp.viewer })).toThrow('stamps "nobody", which is not a member')
  })
})
