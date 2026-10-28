/**
 * The server: the domain's Entities bound to SQLite tables, the guards' bodies,
 * and Remote's server over them. The database is passed in: Node's own SQLite
 * for the tests (`sqlite-node.ts`), SQLite compiled to WebAssembly for the
 * published demo, which runs this server in the browser (`host.ts`).
 */
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option } from 'effect'
import { GuardDrizzle } from 'foldkit-guard/drizzle'
import { GuardServer } from 'foldkit-guard/server'
import { Entity, Remote } from 'foldkit-remote'
import {
  bind,
  checkConstraints,
  databaseLayer,
  query,
  source,
  writer,
  type AnyEntityBinding,
  type DrizzleDatabase,
} from 'foldkit-remote-drizzle'
import { RemoteServer, type EntityWriter } from 'foldkit-remote-server'
import { Chirp, Chirper } from '../domain.js'
import { G, Post, type User } from '../guard.js'
import { ByAuthor, EditPost, LikePost, PostChirp, Timeline, Unlike } from '../operations.js'
import { SEED } from './seed.js'

/** A SQLite database the server runs on, and whether it is new, so needs its tables. */
export interface Sqlite {
  readonly fresh: boolean
  readonly exec: (statements: string) => void
  /** The Drizzle database over it, for `databaseLayer`. */
  readonly drizzle: unknown
}

// #region tables
const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  handle: text('handle').notNull(),
  name: text('name').notNull(),
})
const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  authorId: text('author_id').notNull(),
  body: text('body').notNull(),
  createdAt: integer('created_at').notNull(),
})
const likes = sqliteTable('likes', {
  id: text('id').primaryKey(),
  postId: text('post_id').notNull(),
  userId: text('user_id').notNull(),
})
// #endregion

// #region implement
const admins = new Set(['ada'])

export const Policy = G.implement({
  isAdmin: principal => Option.exists(principal, user => admins.has(user.id)),
})
// #endregion

// #region bind
const Db = bind(
  { User: Chirper, Post, Like: Chirp.Like },
  {
    User: { table: users, relations: { posts: { foreignKey: posts.authorId } } },
    Post: {
      table: posts,
      visible: GuardDrizzle.visible(Policy, [Post]).Post,
      relations: { author: { field: posts.authorId } },
      // likeCount and liked say what they read: only `may` is the server's to supply.
      derived: { may: { supplied: true } },
    },
    Like: {
      table: likes,
      relations: { post: { field: likes.postId }, user: { field: likes.userId } },
    },
  },
)
// #endregion

// #region checks
/** A table's CHECKs, compiled from its Entity's rules: none is written here by hand. */
const checksOf = (binding: AnyEntityBinding) =>
  checkConstraints(binding)
    .constraints.map(({ constraint }) => `, ${constraint}`)
    .join('')

const SCHEMA = `
  create table users (
    id text primary key, handle text not null, name text not null${checksOf(Db.User)}
  );
  create table posts (
    id text primary key,
    author_id text not null references users(id),
    body text not null,
    created_at integer not null${checksOf(Db.Post)}
  );
  create table likes (
    id text primary key,
    post_id text not null references posts(id),
    user_id text not null references users(id),
    unique (post_id, user_id)
  );
`
// #endregion

// Every write of a post is decided by its rules before it lands. Who wrote a
// chirp, and when, are the server's to say: the browser sends neither.
// #region presets
const guarded = GuardServer.writer(Post, Policy, writer(Db.Post), {
  presets: { authorId: user => user.id, createdAt: () => Date.now() },
})
// #endregion

// #region likes
/** Who is asking, as the row a like points at. */
const asker = (principal: Option.Option<User>) =>
  Option.map(principal, user => Remote.ref(Chirper, user.id))

/**
 * A like is its liker's own: one made in another's name, or taken back by
 * anyone else, is refused before anything is written.
 */
const ownLikes = (
  likes: EntityWriter<Option.Option<User>, DrizzleDatabase>,
): EntityWriter<Option.Option<User>, DrizzleDatabase> => {
  const linked = likes.linked
  if (linked === undefined) throw new Error('A like writer reads whose a like is')
  /** Whether `user`, a like's link as stored (`'User:ada'`), is who is asking. */
  const mine = (principal: Option.Option<User>, user: unknown) =>
    Option.exists(asker(principal), ref => Entity.refKey(ref) === user)
  const refused = RemoteServer.forbid('A like is yours to make, and yours to take back.')
  return {
    ...likes,
    insert: context =>
      Option.exists(context.links.user ?? Option.none(), user =>
        mine(context.principal, Entity.refKey(user)),
      )
        ? likes.insert(context)
        : Effect.fail(refused),
    delete: context =>
      Effect.flatMap(linked({ id: context.id, relations: ['user'] }), held =>
        // Gone already is gone: a retry of your own unlike.
        Option.match(held, {
          onNone: () => true,
          onSome: row => mine(context.principal, row.user),
        })
          ? likes.delete(context)
          : Effect.fail(refused),
      ),
  }
}
const likeWrites = ownLikes(writer(Db.Like))
// #endregion

export const server = RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
  entities: [
    source(Db.User),
    // `liked` is each reader's own: the source answers it for whoever asks.
    source(Db.Post, { filter: GuardServer.filter(Post, Policy), viewer: asker }),
    source(Db.Like),
  ],
  queries: [query(Timeline, { entity: Db.Post }), query(ByAuthor, { entity: Db.Post })],
  mutations: [
    RemoteServer.write(PostChirp, guarded),
    RemoteServer.write(EditPost, guarded),
    RemoteServer.write(LikePost, likeWrites),
    RemoteServer.write(Unlike, likeWrites),
  ],
})

// A guarded Entity served without its rule would serve every row: refuse to start.
GuardServer.validate(Policy, {
  entities: [Post],
  domain: Remote.define({ entities: [Chirper, Post, Chirp.Like], queries: [Timeline, ByAuthor] }),
  server,
})

/** The server over `sqlite`: its tables made and seeded when the database is new. */
export const openServer = (sqlite: Sqlite) => {
  if (sqlite.fresh) {
    sqlite.exec(SCHEMA)
    sqlite.exec(SEED)
  }
  return { server, database: databaseLayer(sqlite.drizzle) }
}

/** Who a person is to the guards: signed in as themselves. */
export const principalOf = (id: string): Option.Option<User> => Option.some({ id })
