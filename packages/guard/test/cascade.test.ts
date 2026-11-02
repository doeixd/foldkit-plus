// @vitest-environment node
/**
 * A guarded delete of a row that takes others with it (#343): the guard
 * judges the row named and hands the cascade to its writer, which removes
 * the rows declared to go with it. Who may delete those is #348's.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Relation, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { bind, databaseLayer, writer, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { GuardDrizzle } from '../src/drizzle.js'
import { Guards } from '../src/index.js'
import { GuardServer } from '../src/server.js'

const User = Schema.Struct({ id: Schema.String })
type User = typeof User.Type

const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
})
const likes = sqliteTable('likes', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull(),
})

const PostFields = Entity.define(
  'Post',
  Schema.Struct({ id: Schema.String, ownerId: Schema.String }),
)
const Related = Entity.relate(
  { Post: PostFields, Like: Entity.define('Like', Schema.Struct({ id: Schema.String })) },
  { Like: { post: Relation.one(PostFields, { onDelete: 'cascade' }) } },
)
const G = Guards.declare(
  'Posts',
  User,
  guard => ({
    isOwner: guard.row(Related.Post, p => Expr.eq(Related.Post.fields.ownerId, p.id)),
  }),
  { key: user => user.id, unguarded: 'allow' },
)
const Post = Related.Post.pipe(Guards.attach(G, { row: { Delete: [G.isOwner] } }))
const Policy = G.implement({})
const Db = bind(
  { Post, Like: Related.Like },
  {
    Post: { table: posts, visible: GuardDrizzle.visible(Policy, [Post]).Post },
    Like: { table: likes, relations: { post: { field: likes.postId } } },
  },
)
const DeletePost = Mutation.write(
  'DeletePost',
  Write.delete(Entity.input(Post, Schema.Struct({ id: Schema.String })), { id: 'id' }),
)

describe('A guarded delete that cascades', () => {
  it('judges the row named, and its writer removes what goes with it', async () => {
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(`
      create table posts (id text primary key, owner_id text not null);
      create table likes (id text primary key, post_id text not null);
      insert into posts values ('p1', 'ada'), ('p2', 'bo');
      insert into likes values ('l1', 'p1'), ('l2', 'p2');
    `)
    const server = RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
      entities: [],
      mutations: [
        RemoteServer.write(DeletePost, GuardServer.writer(Post, Policy, writer(Db.Post))),
      ],
    })
    const send = (id: string) =>
      Effect.runPromise(
        RemoteServer.handlers(server, Option.some<User>({ id: 'ada' }))
          .FoldkitRemoteMutate({ requestId: `r-${id}`, mutation: 'DeletePost', input: { id } })
          .pipe(Effect.result, Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
      )
    expect(await send('p2')).toMatchObject({ _tag: 'Failure' })
    expect(await send('p1')).toMatchObject({
      _tag: 'Success',
      success: {
        deleted: [
          { entity: 'Post', id: 'p1' },
          { entity: 'Like', id: 'l1' },
        ],
      },
    })
    expect(
      sqlite
        .prepare('select id from likes')
        .all()
        .map(row => row['id']),
    ).toEqual(['l2'])
  })
})
