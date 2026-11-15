/**
 * The domain, declared once and read from both ends. Nothing here is a CMS
 * until the last two declarations: a Post is an Entity, editing it is a form,
 * and publishing it is two mutations of the application's own.
 */
import { Schema } from 'effect'
import { Cms } from 'foldkit-cms'
import { Entity, Expr, Order } from 'foldkit-entity'
import { Query } from 'foldkit-remote'

/** Where this demo's code is read: the site links to it, and its pages point to it. */
export const SOURCE = 'https://github.com/doeixd/foldkit-plus/tree/main/examples/cms'

/** Where the published demo is served: the site's canonical addresses start here. */
export const ORIGIN = 'https://foldkit-cms-demo.pages.dev'

export const PostId = Schema.String.pipe(Schema.brand('PostId'))
export type PostId = typeof PostId.Type

export const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: PostId,
    title: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Title' }),
    slug: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Address' }),
    excerpt: Schema.String.annotate({
      title: 'Excerpt',
      description: 'A sentence or two for the blog index and the post lists.',
    }),
    cover: Schema.String.annotate({
      title: 'Cover image',
      description: 'The address of an image, or nothing.',
    }),
    body: Schema.String.annotate({
      title: 'Body',
      description:
        'Paragraphs are separated by a blank line. Start one with ## for a heading, or each of its lines with - for a list. Code goes between two lines of ```, or `between backticks` in a sentence.',
    }),
    publishedAt: Schema.NullOr(Schema.String),
  }),
).pipe(
  // Which members play a CMS part is a fact about the Entity.
  Cms.roles({ label: 'title', slug: 'slug', published: 'publishedAt' }),
)

/** What an author enters, which is what publishing takes. */
export const PostInput = Schema.Struct({
  title: Post.fields.title.schema,
  slug: Post.fields.slug.schema,
  excerpt: Post.fields.excerpt.schema,
  cover: Post.fields.cover.schema,
  body: Post.fields.body.schema,
})

/**
 * The posts-by-address query, from what a reader of the content needs: no form, so the public
 * site, which reads posts by address, does not load the editor that writes them.
 */
export const PostsBySlug = Cms.bySlug({ name: 'posts', entity: Post, roles: Cms.rolesOf(Post) })

/** The public page's reading of a post, and the worklist's reading of an entry. */
export const PostPage = Entity.select(Post, {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  cover: true,
  body: true,
  publishedAt: true,
})

/**
 * The post as the editor's preview reads it: only what the form holds, so a
 * preview of something never published, laid over the store, has every field.
 */
export const PostPreview = Entity.select(Post, {
  title: true,
  slug: true,
  excerpt: true,
  cover: true,
  body: true,
})

/**
 * The blog, newest first: what the site's index and a page's post list read.
 * Only what is published, whoever asks, so an author's preview of the site
 * lists what a visitor would.
 */
export const RecentPosts = Query.define('RecentPosts', {}, () =>
  Query.from(Post).pipe(
    Query.where(Cms.published(Post)),
    Query.orderBy(Order.desc(Post.fields.publishedAt)),
  ),
)

/** One post by its row's id: what a Block that features a post reads. */
export const PostById = Query.define('PostById', { id: PostId }, ({ input }) =>
  Query.from(Post).pipe(
    Query.where(Expr.eq(Post.fields.id, input.id)),
    Query.orderBy(Order.asc(Post.fields.id)),
  ),
)

export const EntryRow = Entity.select(Cms.Entities.Entry, { id: true, label: true, state: true })
