import { Schema } from 'effect'
import { Derived, Entity, Relation } from 'foldkit-entity'
import { Query } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { Crud, Display } from '../src/index.js'

const Author = Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Comment = Entity.define('Comment', Schema.Struct({ id: Schema.String, body: Schema.String }))
const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    cents: Schema.Number,
    live: Schema.Boolean,
    subtitle: Schema.NullOr(Schema.String),
  }),
).pipe(Entity.derived({ commentCount: Derived.make(Schema.Number) }))
const Blog = Entity.relate(
  { Author, Comment, Post },
  {
    Post: {
      author: Relation.one(Author),
      editor: Relation.one(Author, { optional: true }),
      comments: Relation.many(Comment),
    },
  },
)
const Shown = Blog.Post.pipe(
  Entity.annotateMembers({
    id: Display.of(Display.hidden()),
    cents: Display.of(Display.number(cents => `$${(cents / 100).toFixed(2)}`)),
  }),
)

const Name = Entity.select(Blog.Author, { name: true })
const Body = Entity.select(Blog.Comment, { id: true, body: true })
const PostsQuery = Query.make('Posts', { Input: {}, Result: Query.connection(Shown) })
const Posts = Crud.list('Posts', {
  query: PostsQuery,
  selection: Entity.select(Shown, {
    id: true,
    title: true,
    cents: true,
    live: true,
    subtitle: true,
    commentCount: true,
    author: Name,
    editor: true,
    comments: Body,
  }),
})
const displayOf = (key: string) => Posts.columns.find(column => column.key === key)!.display

describe('Display', () => {
  it('gives each column a Display from its metadata, how it was selected, or its schema', () => {
    expect(Posts.columns.map(column => [column.key, column.display._tag])).toEqual([
      ['id', 'Hidden'],
      ['title', 'Text'],
      ['cents', 'Number'],
      ['live', 'Flag'],
      ['subtitle', 'Text'],
      ['commentCount', 'Number'],
      ['author', 'Nested'],
      ['editor', 'Ref'],
      ['comments', 'Nested'],
    ])
    expect(displayOf('author')).toMatchObject({ shape: 'one', target: Blog.Author })
    expect(displayOf('comments')).toMatchObject({ shape: 'many' })
    expect(displayOf('editor')).toMatchObject({ many: false, target: Blog.Author })
  })

  it('reads a page of a relation as a page', () => {
    const Latest = Crud.detail('Latest', {
      selection: Entity.select(Shown, { comments: Entity.page(Body, { first: 1 }) }),
    })
    expect(Latest.fields[0]!.display).toMatchObject({ _tag: 'Nested', shape: 'page' })
    expect(
      Display.show(Latest.fields[0]!.display, {
        items: [{ id: 'c1', body: 'First' }],
        hasNext: true,
        hasPrevious: false,
      }),
    ).toBe('c1 First')
  })

  it('shows a value as the text its Display calls for', () => {
    expect(Display.show(displayOf('title'), 'Hello')).toBe('Hello')
    expect(Display.show(displayOf('cents'), 1250)).toBe('$12.50')
    expect(Display.show(displayOf('commentCount'), 3)).toBe('3')
    expect(Display.show(displayOf('live'), true)).toBe('yes')
    expect(Display.show(displayOf('live'), false, { yes: 'oui', no: 'non' })).toBe('non')
    expect(Display.show(displayOf('id'), 'p1')).toBe('')
    expect(Display.show(displayOf('editor'), { entity: 'Author', id: 'a1' })).toBe('a1')
  })

  it('shows a nested value by its own columns, one or many', () => {
    expect(Display.show(displayOf('author'), { name: 'Ada' })).toBe('Ada')
    expect(
      Display.show(displayOf('comments'), [
        { id: 'c1', body: 'First' },
        { id: 'c2', body: 'Second' },
      ]),
    ).toBe('c1 First, c2 Second')
  })

  it('says nothing, in the words given, for what is absent or empty', () => {
    expect(Display.show(displayOf('subtitle'), null)).toBe('')
    expect(Display.show(displayOf('subtitle'), null, { nothing: '—' })).toBe('—')
    expect(Display.show(displayOf('comments'), [], { nothing: 'none' })).toBe('none')
    expect(Display.show(displayOf('editor'), null, { nothing: '—' })).toBe('—')
  })
})
