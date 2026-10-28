/**
 * A stamp stored on a column another member is stored on too: a field and a
 * `one` relation over one foreign key. No input sets a stamp, by its member's
 * name or by the other's, so `bind` refuses an Entity that stamps only one of
 * them, and `RemoteServer.write` a write that sets the other.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import { Entity, Relation, Stamp, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { bind, databaseLayer, writer, type DrizzleDatabase } from '../src/index.js'

const users = sqliteTable('users', { id: text('id').primaryKey() })
const posts = sqliteTable('posts', { id: text('id').primaryKey() })
const likes = sqliteTable('likes', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull(),
  userId: text('user_id').notNull(),
})

const UserFields = Entity.define('User', Schema.Struct({ id: Schema.String }))
const PostFields = Entity.define('Post', Schema.Struct({ id: Schema.String }))
const Social = Entity.relate(
  {
    User: UserFields,
    Post: PostFields,
    Like: Entity.define('Like', Schema.Struct({ id: Schema.String, userId: Schema.String })),
  },
  { Like: { post: Relation.one(PostFields), user: Relation.one(UserFields) } },
)
// The field and the relation are one column: `userId` is `user`'s foreign key.
const storage = {
  User: { table: users },
  Post: { table: posts },
  Like: {
    table: likes,
    relations: { post: { field: likes.postId }, user: { field: likes.userId } },
  },
}
const LikeByField = Social.Like.pipe(Entity.stamps({ userId: Stamp.viewer }))

describe('a stamp on a column another member shares', () => {
  it('is refused where it is bound, naming both members and the column', () => {
    expect(() =>
      bind({ User: Social.User, Post: Social.Post, Like: LikeByField }, storage),
    ).toThrow(
      'entity "Like" stamps "userId" but not "user", both stored on column "user_id": a write of "user" would overwrite the stamp; stamp both or neither',
    )
  })

  it('is bound when both are stamped', () => {
    const Both = Social.Like.pipe(Entity.stamps({ userId: Stamp.viewer, user: Stamp.viewer }))
    expect(() => bind({ User: Social.User, Post: Social.Post, Like: Both }, storage)).not.toThrow()
  })

  // Bound unstamped, as an application binds its Entity once and stamps it where it writes.
  const Db = bind({ User: Social.User, Post: Social.Post, Like: Social.Like }, storage)
  const LikeAs = Mutation.write(
    'LikeAs',
    Write.insert(
      Entity.input(
        LikeByField,
        Schema.Struct({ id: Schema.String, postId: Schema.String, by: Schema.String }),
        { postId: 'post', by: 'user' },
      ),
      { id: 'id' },
    ),
  )

  it('refuses a write that sets the other member, naming both members and the column', () => {
    expect(() => RemoteServer.write(LikeAs, writer(Db.Like))).toThrow(
      'it writes "user", stored on column "user_id" with the stamped "userId"; no input sets a stamp',
    )
  })

  it('stamps the column with who asks for a write that leaves it alone', async () => {
    const LikePost = Mutation.write(
      'LikePost',
      Write.insert(
        Entity.input(LikeByField, Schema.Struct({ id: Schema.String, postId: Schema.String }), {
          postId: 'post',
        }),
        { id: 'id' },
      ),
    )
    const server = RemoteServer.make<string, DrizzleDatabase>({
      entities: [],
      mutations: [RemoteServer.write(LikePost, writer(Db.Like))],
      viewer: principal => Option.some({ entity: 'User', id: principal }),
    })
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(`
      create table likes (id text primary key, post_id text not null, user_id text not null);
    `)
    await Effect.runPromise(
      RemoteServer.handlers(server, 'alice')
        .FoldkitRemoteMutate({
          requestId: 'r',
          mutation: 'LikePost',
          input: { id: 'l1', postId: 'p1' },
        })
        .pipe(Effect.provide(databaseLayer(drizzle({ client: sqlite })))),
    )
    expect(sqlite.prepare('select user_id from likes where id = ?').get('l1')).toEqual({
      user_id: 'alice',
    })
  })
})
