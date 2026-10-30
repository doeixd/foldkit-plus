/**
 * A member the write's context sets (`Entity.sets`), stored on a column
 * another member is stored on too: a field and a `one` relation over one
 * foreign key. No input sets it, by its member's name or by the other's, so
 * `bind` refuses an Entity that sets only one of them, and
 * `RemoteServer.write` a write that sets the other.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Relation, Write } from 'foldkit-entity'
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
/** A Like of its own: what one case sets from the context, it sets for good. */
const social = () =>
  Entity.relate(
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
const byField = (like: ReturnType<typeof social>['Like']) =>
  like.pipe(Entity.sets({ userId: Expr.viewer(UserFields) }, { on: 'create' }))

describe('a context set on a column another member shares', () => {
  it('is refused where it is bound, naming both members and the column', () => {
    const Social = social()
    const Like = byField(Social.Like)
    expect(() => bind({ User: Social.User, Post: Social.Post, Like }, storage)).toThrow(
      `entity "Like" sets "userId" from the write's context but not "user", both stored on column "user_id": a write of "user" would overwrite it; set both or neither`,
    )
  })

  it('is bound when both are set', () => {
    const Social = social()
    const Both = Social.Like.pipe(
      Entity.sets(
        { userId: Expr.viewer(UserFields), user: Expr.viewer(UserFields) },
        { on: 'create' },
      ),
    )
    expect(() => bind({ User: Social.User, Post: Social.Post, Like: Both }, storage)).not.toThrow()
  })

  // Bound before its sets were declared, so the binding could not refuse them: the write is checked.
  const Social = social()
  const Db = bind({ User: Social.User, Post: Social.Post, Like: Social.Like }, storage)
  const LikeByField = byField(Social.Like)
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
      `it writes "user", stored on column "user_id" with "userId", which the write's context sets; no input sets it`,
    )
  })

  it('sets the column to who asks for a write that leaves it alone', async () => {
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
