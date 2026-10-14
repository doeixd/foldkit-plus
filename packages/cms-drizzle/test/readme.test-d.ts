// The README's snippets, compiled. Keep the two in step.
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import { Cms } from 'foldkit-cms'
import { Entity, Expr } from 'foldkit-entity'
import { Guards } from 'foldkit-guard'
import { GuardDrizzle } from 'foldkit-guard/drizzle'
import { Form } from 'foldkit-form'
import { Mutation } from 'foldkit-remote'
import { DrizzleDatabase, bind, source } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { CmsServer, Transaction, sqliteTables } from '../src/index.js'

const User = Schema.Struct({
  id: Schema.String,
  role: Schema.Literals(['author', 'editor', 'reader']),
})
type Principal = Option.Option<typeof User.Type>

const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  publishedAt: text('published_at'),
})
const authors = sqliteTable('authors', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
})

const Blog = {
  Post: Entity.define(
    'Post',
    Schema.Struct({
      id: Schema.String,
      title: Schema.String,
      publishedAt: Schema.NullOr(Schema.String),
    }),
  ).pipe(Cms.roles({ label: 'title', published: 'publishedAt' })),
  Author: Entity.define('Author', Schema.Struct({ id: Schema.String, name: Schema.String })),
}
const PostInput = Schema.Struct({ title: Schema.String })
const Posts = Cms.content('posts', {
  entity: Blog.Post,
  form: Form.make('PostForm', Entity.input(Blog.Post, PostInput)),
  publish: {
    create: Mutation.make('CreatePost', { Input: PostInput, Output: { id: Schema.String } }),
    update: Mutation.make('UpdatePost', {
      Input: { ...PostInput.fields, id: Schema.String },
      Output: {},
    }),
  },
  words: { one: 'Post', many: 'Posts' },
})

const cmsTables = sqliteTables() // or pgTables(); add them to your schema and migrations

// Who is an author, who may publish, and what a visitor sees: a guard set.
const G = Guards.declare(
  'Cms',
  User,
  guard => ({
    isAuthor: guard.principal(),
    isEditor: guard.principal(),
    isPublished: guard.row(Blog.Post, () => Expr.isNotNull(Blog.Post.fields.publishedAt)),
  }),
  { key: user => user.id, unguarded: 'allow' },
)
const Policy = G.implement({
  isAuthor: principal => Option.exists(principal, user => user.role !== 'reader'),
  isEditor: principal => Option.exists(principal, user => user.role === 'editor'),
})
// A visitor sees what is published; an author sees every row.
const Post = Blog.Post.pipe(Guards.attach(G, { row: { Read: [G.isPublished, G.isAuthor] } }))

const Db = bind(
  { ...Blog, Post },
  {
    Post: { table: posts, visible: GuardDrizzle.visible(Policy, [Post]).Post },
    Author: { table: authors },
  },
)

// Your own handlers of the two mutations the content type publishes through.
const CreatePost = RemoteServer.mutation<Principal, DrizzleDatabase>(Posts.publish.create, () =>
  Effect.succeed({ output: { id: 'p1' } }),
)
const UpdatePost = RemoteServer.mutation<Principal, DrizzleDatabase>(Posts.publish.update, () =>
  Effect.succeed({ output: {} }),
)

const cms = CmsServer.make({
  tables: cmsTables,
  content: [
    { type: Posts, entity: Post, binding: Db.Post, create: CreatePost, update: UpdatePost },
  ],
  transaction: Transaction.statements, // one connection; Transaction.drizzle for Postgres
  policy: Policy,
  authors: [G.isAuthor],
  // An author writes; only an editor puts it in front of visitors.
  transitions: { publish: [G.isEditor], schedule: [G.isEditor], unpublish: [G.isEditor] },
})

export const server = RemoteServer.make({
  entities: [...cms.sources, source(Db.Author)],
  queries: [...cms.queries],
  mutations: [...cms.mutations],
})
