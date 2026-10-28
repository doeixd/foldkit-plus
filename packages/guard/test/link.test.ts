// @vitest-environment node
/**
 * A guard rule over a link (`Expr.eq(Like.relations.user, p.id)`), with no
 * field repeating it: compiled to the relation's column where it filters a
 * read, and judged over the row a writer reads, whose link is a ref key, where
 * it decides a write. operations-phase3-DESIGN.
 */
import { DatabaseSync } from 'node:sqlite'
import { drizzle } from 'drizzle-orm/node-sqlite'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option, Schema } from 'effect'
import { Entity, Expr, Relation, Write } from 'foldkit-entity'
import { Mutation } from 'foldkit-remote'
import { bind, databaseLayer, source, writer, type DrizzleDatabase } from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { describe, expect, it } from 'vitest'
import { GuardDrizzle } from '../src/drizzle.js'
import { Guards } from '../src/index.js'
import { GuardServer } from '../src/server.js'

const Principal = Schema.Struct({ id: Schema.String })
type Principal = typeof Principal.Type

const users = sqliteTable('users', { id: text('id').primaryKey() })
const likes = sqliteTable('likes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
})

const Fields = {
  User: Entity.define('User', Schema.Struct({ id: Schema.String })),
  Like: Entity.define('Like', Schema.Struct({ id: Schema.String })),
}
const Related = Entity.relate(Fields, { Like: { user: Relation.one(Fields.User) } })
const G = Guards.declare(
  'Likes',
  Principal,
  guard => ({
    isLiker: guard.row(Related.Like, p => Expr.eq(Related.Like.relations.user, p.id)),
    isModerator: guard.principal(),
  }),
  { key: principal => principal.id, unguarded: 'allow' },
)
const Like = Related.Like.pipe(
  // A moderator reads every like, and may take back none but their own.
  Guards.attach(G, { row: { Read: [G.isLiker, G.isModerator], Delete: [G.isLiker] } }),
)
const Policy = G.implement({
  isModerator: principal => Option.exists(principal, ({ id }) => id === 'mo'),
})
const Db = bind(
  { User: Related.User, Like },
  {
    User: { table: users },
    Like: {
      table: likes,
      visible: GuardDrizzle.visible(Policy, [Like]).Like,
      relations: { user: { field: likes.userId } },
    },
  },
)

const Unlike = Mutation.write(
  'Unlike',
  Write.delete(Entity.input(Like, Schema.Struct({ id: Schema.String })), { id: 'id' }),
)
const server = RemoteServer.make<Option.Option<Principal>, DrizzleDatabase>({
  entities: [source(Db.Like)],
  mutations: [RemoteServer.write(Unlike, GuardServer.writer(Like, Policy, writer(Db.Like)))],
})

const open = () => {
  const sqlite = new DatabaseSync(':memory:')
  sqlite.exec(`
    create table users (id text primary key);
    create table likes (id text primary key, user_id text not null);
    insert into likes values ('l1', 'ada'), ('l2', 'bo');
  `)
  const run = <A, E>(
    who: string,
    effect: (handlers: ReturnType<typeof as>) => Effect.Effect<A, E, DrizzleDatabase>,
  ) =>
    Effect.runPromise(
      effect(as(who)).pipe(
        Effect.provide(databaseLayer(drizzle({ client: sqlite }))),
        Effect.result,
      ),
    )
  const as = (who: string) => RemoteServer.handlers(server, Option.some({ id: who }))
  return {
    read: (who: string, ids: ReadonlyArray<string>) =>
      run(who, handlers =>
        handlers.FoldkitRemoteRead({
          version: 4,
          requests: ids.map(id => ({ entity: 'Like', id, fields: ['id', 'user'] })),
        }),
      ),
    unlike: (who: string, id: string) =>
      run(who, handlers =>
        handlers.FoldkitRemoteMutate({ requestId: 'r1', mutation: 'Unlike', input: { id } }),
      ),
    ids: () =>
      sqlite
        .prepare('select id from likes order by id')
        .all()
        .map(row => row.id),
  }
}

describe('a guard rule over a link', () => {
  it('filters a read by the column the relation is stored on', async () => {
    const { read } = open()
    expect(await read('ada', ['l1', 'l2'])).toMatchObject({
      success: { entities: [{ id: 'l1', values: { id: 'l1', user: 'User:ada' } }] },
    })
    expect(await read('mo', ['l1', 'l2'])).toMatchObject({
      success: { entities: [{ id: 'l1' }, { id: 'l2' }] },
    })
  })

  it("decides a write over the row read, its link a ref key: the liker's own", async () => {
    const { unlike, ids } = open()
    // The moderator reads the like, and the rule over its link refuses them.
    expect(await unlike('mo', 'l1')).toMatchObject({ failure: { _tag: 'Forbidden' } })
    expect(ids()).toEqual(['l1', 'l2'])
    expect(await unlike('ada', 'l1')).toMatchObject({ _tag: 'Success' })
    expect(ids()).toEqual(['l2'])
  })
})
