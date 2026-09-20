import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { Mutation, Remote, Selection } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { Cms, type Facts } from '../src/index.js'

const PostId = Schema.String.pipe(Schema.brand('PostId'))
const BasePost = Entity.define(
  'Post',
  Schema.Struct({
    id: PostId,
    title: Schema.String,
    slug: Schema.String,
    views: Schema.Number,
    publishedAt: Schema.NullOr(Schema.String),
  }),
)
const Post = BasePost.pipe(Cms.roles({ label: 'title', slug: 'slug', published: 'publishedAt' }))

const PostInput = Schema.Struct({ title: Schema.String, slug: Schema.String })
const PostForm = Form.make('PostForm', Entity.input(Post, PostInput))
const publish = {
  create: Mutation.make('CreatePost', { Input: PostInput, Output: { id: PostId } }),
  update: Mutation.make('UpdatePost', {
    Input: { ...PostInput.fields, id: PostId },
    Output: {},
  }),
}
const words = { one: 'Post', many: 'Posts' }
const Posts = Cms.content('posts', { entity: Post, form: PostForm, publish, words })

const now = new Date('2026-09-19T12:00:00Z')
const past = '2026-09-19T11:00:00Z'
const future = '2026-09-19T13:00:00Z'
const draft = (scheduledFor: string | null = null, scheduleError: string | null = null) => ({
  scheduledFor,
  scheduleError,
})
const facts = (over: Partial<Facts>): Facts => ({
  archivedAt: null,
  row: 'none',
  draft: null,
  ...over,
})

describe('Cms.roles', () => {
  it('names the members that play a part, as metadata on the same Entity', () => {
    expect(Entity.same(Post, BasePost)).toBe(true)
    expect(Cms.rolesOf(Post)).toEqual({
      label: Post.fields.title,
      slug: Post.fields.slug,
      published: Post.fields.publishedAt,
    })
    expect(Cms.rolesOf(BasePost)).toEqual({
      label: undefined,
      slug: undefined,
      published: undefined,
    })
  })

  it('adds to roles given earlier', () => {
    const Later = BasePost.pipe(Cms.roles({ label: 'title' }), Cms.roles({ slug: 'slug' }))
    expect(Cms.rolesOf(Later)).toMatchObject({ label: Post.fields.title, slug: Post.fields.slug })
  })

  it.each([
    [
      'a slug that is not text',
      { slug: 'views' },
      '"views" of Post is not text, so it cannot be its slug',
    ],
    [
      'a published that admits no null',
      { published: 'title' },
      '"title" of Post admits no null, so it cannot say a row is unpublished',
    ],
    ['a member that is not a field', { label: 'nope' }, '"nope" is not a field of Post'],
  ])('refuses %s', (_, roles, message) => {
    expect(() => BasePost.pipe(Cms.roles(roles as never))).toThrow(message)
  })
})

describe('Cms.content', () => {
  it('reads the roles off the Entity it is given', () => {
    expect(Posts.roles.slug).toBe(Post.fields.slug)
    expect(Posts.name).toBe('posts')
  })

  it('refuses a form that edits another Entity', () => {
    const Other = Entity.define('Page', Schema.Struct({ id: Schema.String, title: Schema.String }))
    const OtherForm = Form.make(
      'PageForm',
      Entity.input(Other, Schema.Struct({ title: Schema.String })),
    )
    expect(() =>
      Cms.content('posts', { entity: Post, form: OtherForm as never, publish, words }),
    ).toThrow('content "posts" is of Post, but its form edits Page')
  })
})

describe('Cms.state', () => {
  it.each([
    ['nothing published yet', facts({ draft: draft() }), 'New'],
    ['what a visitor sees is all there is', facts({ row: 'visible' }), 'Published'],
    ['published, with work beside it', facts({ row: 'visible', draft: draft() }), 'Changed'],
    ['a row a visitor cannot see', facts({ row: 'hidden' }), 'Unpublished'],
    ['a hidden row with work beside it', facts({ row: 'hidden', draft: draft() }), 'Unpublished'],
    [
      'put away, whatever else is true',
      facts({ row: 'visible', draft: draft(), archivedAt: past }),
      'Archived',
    ],
  ])('%s', (_, given, tag) => {
    expect(Cms.state(given, now)._tag).toBe(tag)
  })

  it('carries a schedule beside the state, and says when it is overdue and why', () => {
    expect(Cms.state(facts({ draft: draft(future) }), now)).toEqual({
      _tag: 'New',
      schedule: { at: future, overdue: false, error: null },
    })
    // The time came and it is still a draft: the publish did not run, or failed.
    expect(Cms.state(facts({ row: 'visible', draft: draft(past, 'slug taken') }), now)).toEqual({
      _tag: 'Changed',
      schedule: { at: past, overdue: true, error: 'slug taken' },
    })
    expect(Cms.state(facts({ draft: draft(future), archivedAt: past }), now).schedule).toBeNull()
  })
})

describe('Cms.offers', () => {
  const offered = (given: Facts, content: { readonly roles: typeof Posts.roles } = Posts) =>
    Cms.offers(given, now, content)

  it.each([
    [
      'a new entry with a draft',
      facts({ draft: draft() }),
      ['save', 'discard', 'publish', 'schedule', 'archive'],
    ],
    ['a published entry', facts({ row: 'visible' }), ['save', 'unpublish', 'restore', 'archive']],
    [
      'a scheduled change',
      facts({ row: 'visible', draft: draft(future) }),
      ['save', 'discard', 'publish', 'unschedule', 'unpublish', 'restore', 'archive'],
    ],
    ['a hidden row', facts({ row: 'hidden' }), ['save', 'restore', 'archive']],
    ['an archived entry', facts({ row: 'visible', archivedAt: past }), ['unarchive']],
  ])('%s', (_, given, transitions) => {
    expect(offered(given)).toEqual(transitions)
  })

  it('does not offer unpublish to a content type with no published role', () => {
    const Plain = { roles: Cms.rolesOf(BasePost) }
    expect(offered(facts({ row: 'visible' }), Plain)).not.toContain('unpublish')
  })
})

describe('the CMS’s own Entities and operations', () => {
  it('register with Remote like any other, and relate an entry to its draft and revisions', () => {
    const entities = Object.values(Cms.Entities)
    expect(entities.map(entity => entity.name)).toEqual(['CmsEntry', 'CmsDraft', 'CmsRevision'])
    expect(() => Remote.define({ entities, mutations: Cms.operations })).not.toThrow()

    const Worklist = Entity.select(Cms.Entities.Entry, {
      id: true,
      label: true,
      state: true,
      draft: Entity.select(Cms.Entities.Draft, { updatedAt: true }),
      revisions: Entity.page(Entity.select(Cms.Entities.Revision, { n: true }), { first: 5 }),
    })
    expect(Selection.from(Worklist).fields).toEqual([
      'id',
      'label',
      'state',
      'draft',
      'revisions@first=5',
    ])
  })

  it('names every operation once', () => {
    const names = Cms.operations.map(operation => operation.name)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain('CmsPublish')
  })
})
