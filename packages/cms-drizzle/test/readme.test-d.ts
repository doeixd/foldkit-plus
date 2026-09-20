// The README's snippets, compiled. Keep the two in step.
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Schema } from 'effect'
import { Cms } from 'foldkit-cms'
import { Entity } from 'foldkit-entity'
import { Form } from 'foldkit-form'
import { Mutation } from 'foldkit-remote'
import { DrizzleDatabase, bind, source } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { CmsServer, Transaction, published, sqliteTables } from '../src/index.js'

type Principal = { readonly role: 'author' | 'reader' } | null
const isAuthor = (principal: Principal): boolean => principal?.role === 'author'

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

const Db = bind(Blog, {
  Post: {
    table: posts,
    // A visitor sees what is published; an author sees every row.
    visible: published(posts.publishedAt, isAuthor),
  },
  Author: { table: authors },
})

// Your own handlers of the two mutations the content type publishes through.
const CreatePost = RemoteServer.mutation<Principal, DrizzleDatabase>(Posts.publish.create, () =>
  Effect.succeed({ output: { id: 'p1' } }),
)
const UpdatePost = RemoteServer.mutation<Principal, DrizzleDatabase>(Posts.publish.update, () =>
  Effect.succeed({ output: {} }),
)

const cms = CmsServer.make<Principal>({
  tables: cmsTables,
  content: [{ type: Posts, binding: Db.Post, create: CreatePost, update: UpdatePost }],
  transaction: Transaction.statements, // one connection; Transaction.drizzle for Postgres
  isAuthor: principal => principal?.role === 'author',
})

export const server = RemoteServer.make({
  entities: [...cms.sources, source(Db.Author)],
  queries: [...cms.queries],
  mutations: [...cms.mutations],
})
