/**
 * A write's `when` is judged on the row before the write and the input alone,
 * so one reading who asks or the time is refused where the write is declared (#572).
 */
import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Entity, Expr, Relation, Write, type Predicate, type Reads } from '../src/index.js'

const User = Entity.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    authorId: Schema.String,
    publishAt: Schema.Number,
  }),
)
const Blog = Entity.relate(
  { User, Post },
  { Post: { author: Relation.one(User), parent: Relation.one(Post, { optional: true }) } },
)
const Edit = Entity.input(Blog.Post, Schema.Struct({ id: Schema.String, title: Schema.String }))

const conditions: Readonly<Record<string, () => Predicate & Reads<'Post'>>> = {
  viewer: () => Expr.eq(Blog.Post.fields.authorId, Expr.viewer(User)),
  now: () => Expr.lte(Blog.Post.fields.publishAt, Expr.now),
  'both, together': () =>
    Expr.and(
      Expr.eq(Blog.Post.fields.authorId, Expr.viewer(User)),
      Expr.lte(Blog.Post.fields.publishAt, Expr.now),
    ),
  'now inside an exists': () =>
    Expr.exists(Blog.Post.relations.parent, Expr.lte(Blog.Post.fields.publishAt, Expr.now)),
  'a path from the viewer': () =>
    Expr.eq(Blog.Post.fields.title, Expr.path(Expr.viewer(User), User.fields.name)),
}

const message = (terms: string) =>
  `[foldkit-entity] Write of Post: its \`when\` reads the write's context (${terms}), which a precondition does not: it is judged on the row before the write and the input only; who is asking is a guard rule's`

describe('A write whose when reads the write’s context', () => {
  it.each([
    ['viewer', 'Expr.viewer'],
    ['now', 'Expr.now'],
    ['both, together', 'Expr.viewer, Expr.now'],
    ['now inside an exists', 'Expr.now'],
    ['a path from the viewer', 'Expr.viewer'],
  ] as const)('is refused where it is declared, for %s', (name, terms) => {
    const when = conditions[name]!
    expect(() => Write.update(Edit, { id: 'id', when })).toThrow(message(terms))
    expect(() => Write.delete(Edit, { id: 'id', when })).toThrow(message(terms))
  })

  it('is declared when its when reads the row and the input only', () => {
    const write = Write.update(Edit, {
      id: 'id',
      when: ({ input }) => Expr.eq(Blog.Post.fields.title, input.title),
    })
    expect(write.when._tag).toBe('Some')
  })
})
