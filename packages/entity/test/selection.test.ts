import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Entity, type AnyEntity } from '../src/index.js'
import { Blog } from './blogFixture.js'

const AuthorOption = Entity.select(Blog.Author, { id: true, name: true })
const CommentBody = Entity.select(Blog.Comment, { body: true })
const PostRow = Entity.select(Blog.Post, {
  title: true,
  commentCount: true,
  author: AuthorOption,
  editor: AuthorOption,
  comments: CommentBody,
})

const ada = { id: 'a1', name: 'Ada' }
const row = {
  title: 'Hello',
  commentCount: 2,
  author: ada,
  editor: null,
  comments: [{ body: 'First' }, { body: 'Second' }],
}
const decodes = (selection: { readonly schema: Schema.Top }, value: unknown): boolean =>
  Schema.is(selection.schema as Schema.Schema<unknown>)(value)

const selectUntyped = Entity.select as (entity: AnyEntity, spec: unknown) => unknown

describe('Entity.select', () => {
  it('assembles nested Selections, derived members, arrays, and nullability', () => {
    expect(decodes(PostRow, row)).toBe(true)
    expect(Object.keys(PostRow.schema.fields)).toEqual([
      'title',
      'commentCount',
      'author',
      'editor',
      'comments',
    ])
  })

  it.each([
    ['a required one that is null', { ...row, author: null }],
    ['an optional one that is missing', { ...row, editor: undefined }],
    ['a many that is a single value', { ...row, comments: { body: 'First' } }],
    ['a nested value missing a selected field', { ...row, author: { id: 'a1' } }],
    ['a derived member of the wrong type', { ...row, commentCount: '2' }],
  ])('does not accept %s', (_, value) => {
    expect(decodes(PostRow, value)).toBe(false)
  })

  it('selects a relation with true as an EntityRef of its target', () => {
    const refs = Entity.select(Blog.Post, { author: true, editor: true, comments: true })
    const value = {
      author: { entity: 'Author', id: 'a1' },
      editor: null,
      comments: [{ entity: 'Comment', id: 'c1' }],
    }

    expect(decodes(refs, value)).toBe(true)
    expect(decodes(refs, { ...value, author: { entity: 'Comment', id: 'c1' } })).toBe(false)
  })

  it('reuses a field’s own schema, so its checks still apply', () => {
    const Titled = Entity.define(
      'Titled',
      Schema.Struct({ title: Schema.String.check(Schema.isMinLength(1)) }),
    )
    const selection = Entity.select(Titled, { title: true })

    expect(selection.schema.fields.title).toBe(Titled.fields.title.schema)
    expect(decodes(selection, { title: '' })).toBe(false)
  })

  it('follows a cycle only as far as the Selections go', () => {
    const page = Entity.select(Blog.Author, {
      name: true,
      posts: Entity.select(Blog.Post, { title: true, author: AuthorOption }),
    })

    expect(decodes(page, { name: 'Ada', posts: [{ title: 'Hello', author: ada }] })).toBe(true)
  })

  it('accepts a Selection of any version of the target Entity', () => {
    const Bare = Entity.define('Bare', Schema.Struct({ id: Schema.String }))
    const { Owner, Owned } = Entity.relate(
      { Owner: Entity.define('Owner', Schema.Struct({ id: Schema.String })), Owned: Bare },
      { Owner: { owned: { target: Bare, cardinality: 'one', optional: false } } },
    )
    // Selected from the bare definition, used where the related one is the target.
    const selection = Entity.select(Owner, { owned: Entity.select(Bare, { id: true }) })

    expect(Entity.same(Owned, Bare)).toBe(true)
    expect(decodes(selection, { owned: { id: 'x' } })).toBe(true)
  })

  it('keeps what was selected, and is frozen', () => {
    expect(PostRow.entity).toBe(Blog.Post)
    expect(PostRow.members.author).toBe(AuthorOption)
    expect(PostRow.members.title).toBe(true)
    expect(Object.isFrozen(PostRow)).toBe(true)
  })

  it.each([
    ['an unknown member', { subtitle: true }, 'cannot select "subtitle", it is not a member'],
    [
      'a nested Selection on a field',
      { title: AuthorOption },
      '"title" is a field, select it with true',
    ],
    [
      'a nested Selection on a derived member',
      { commentCount: AuthorOption },
      '"commentCount" is a derived member, select it with true',
    ],
    [
      'a Selection of the wrong Entity',
      { comments: AuthorOption },
      '"comments" takes true or a Selection of Comment',
    ],
    [
      'a same-named Entity that is not the target',
      {
        author: Entity.select(Entity.define('Author', Schema.Struct({ id: Schema.String })), {
          id: true,
        }),
      },
      '"author" takes true or a Selection of Author',
    ],
    ['false', { author: false }, '"author" takes true or a Selection of Author'],
  ])('rejects %s', (_, spec, message) => {
    // The types reject most of these too; the runtime check covers untyped callers.
    expect(() => selectUntyped(Blog.Post, spec)).toThrow(message)
  })
})

describe('Entity.page', () => {
  const PostWithPage = Entity.select(Blog.Post, {
    title: true,
    comments: Entity.page(CommentBody, { first: 2 }),
  })

  it('reads a many relation as a page of the Selection it pages', () => {
    const value = {
      title: 'Hello',
      comments: { items: [{ body: 'First' }], hasNext: true, hasPrevious: false },
    }
    expect(decodes(PostWithPage, value)).toBe(true)
    // A page is not the list.
    expect(decodes(PostWithPage, { title: 'Hello', comments: [{ body: 'First' }] })).toBe(false)
  })

  it('keeps the Selection and the window for whoever interprets it', () => {
    const page = PostWithPage.members.comments
    expect(page.selection).toBe(CommentBody)
    expect(page.window).toEqual({ first: 2 })
    expect(Object.isFrozen(page)).toBe(true)
  })

  it('takes first or last, a non-negative integer, and a cursor on the matching side', () => {
    expect(() => Entity.page(CommentBody, {})).toThrow(/takes first or last/)
    expect(() => Entity.page(CommentBody, { first: 1, last: 1 })).toThrow(/takes first or last/)
    expect(() => Entity.page(CommentBody, { first: 1.5 })).toThrow(/non-negative integer/)
    expect(() => Entity.page(CommentBody, { last: -1 })).toThrow(/non-negative integer/)
    expect(() => Entity.page(CommentBody, { first: 1, before: 'c' })).toThrow(
      /first after a cursor/,
    )
    expect(() => Entity.page(CommentBody, { last: 1, after: 'c' })).toThrow(/last before one/)
    expect(Entity.page(CommentBody, { last: 3, before: 'c' }).window).toEqual({
      last: 3,
      before: 'c',
    })
  })

  it('refuses a page of a one relation, and a page of another Entity', () => {
    expect(() =>
      selectUntyped(Blog.Post, { author: Entity.page(AuthorOption, { first: 1 }) }),
    ).toThrow(/"author" is one Author, so it has no pages/)
    expect(() =>
      selectUntyped(Blog.Post, { comments: Entity.page(AuthorOption, { first: 1 }) }),
    ).toThrow(/"comments" pages a Selection of Comment/)
  })
})
