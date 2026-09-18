import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Schema } from 'effect'
import { Derived, Entity, Relation } from 'foldkit-entity'
import { Selection, type EntityRef } from 'foldkit-remote'
import { expectTypeOf } from 'vitest'
import { bind, source } from '../src/index.js'

const users = sqliteTable('users', { id: text('id').primaryKey(), name: text('name').notNull() })
const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  authorId: text('author_id').notNull(),
})

const User = Entity.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String })).pipe(
  Entity.derived({ fanCount: Derived.make(Schema.Number) }),
)
const Blog = Entity.relate(
  { User, Post },
  { Post: { author: Relation.one(User), fans: Relation.many(User) }, User: {} },
)

const Db = bind(Blog, {
  User: { table: users },
  Post: {
    table: posts,
    relations: { author: { field: posts.authorId }, fans: { foreignKey: users.id } },
    derived: { fanCount: { relation: 'fans' } },
  },
})

expectTypeOf(Db.Post.name).toEqualTypeOf<'Post'>()
expectTypeOf(Db.Post.table).toEqualTypeOf<typeof posts>()
expectTypeOf<typeof Db.Post.schema.Type>().toEqualTypeOf<{
  readonly id: string
  readonly title: string
  readonly fanCount: number
  readonly author: EntityRef<'User'>
  readonly fans: ReadonlyArray<EntityRef<'User'>>
}>()
// A binding is a Remote descriptor and a source.
Selection.make(Db.Post, { title: true, author: Selection.make(Db.User, { name: true }) })
source(Db.Post)

const user = { table: users }
bind(Blog, {
  User: user,
  // @ts-expect-error Post has relations, so their storage is required
  Post: { table: posts, derived: { fanCount: { relation: 'fans' } } },
})
bind(Blog, {
  User: user,
  Post: {
    table: posts,
    // @ts-expect-error a one relation is stored as a field, not a foreign key on the target
    relations: { author: { foreignKey: users.id }, fans: { foreignKey: users.id } },
    derived: { fanCount: { relation: 'fans' } },
  },
})
bind(Blog, {
  User: user,
  Post: {
    table: posts,
    relations: { author: { field: posts.authorId }, fans: { foreignKey: users.id } },
    // @ts-expect-error a count needs a many relation
    derived: { fanCount: { relation: 'author' } },
  },
})
bind(Blog, {
  User: user,
  Post: {
    table: posts,
    // @ts-expect-error "subtitle" is not a field of Post
    fields: { subtitle: posts.title },
    relations: { author: { field: posts.authorId }, fans: { foreignKey: users.id } },
    derived: { fanCount: { relation: 'fans' } },
  },
})
// @ts-expect-error every Entity needs a table
bind(Blog, { User: user })
