/**
 * The server: the domain's Entities bound to SQLite tables, the guards' bodies,
 * and Remote's server over them. The database is passed in: Node's own SQLite
 * for the tests (`sqlite-node.ts`), SQLite compiled to WebAssembly for the
 * published demo, which runs this server in the browser (`host.ts`).
 */
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option } from 'effect'
import { GuardDrizzle } from 'foldkit-guard/drizzle'
import { GuardServer } from 'foldkit-guard/server'
import { Remote } from 'foldkit-remote'
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
import { Chirper } from '../domain.js'
import { G, Like, Post, type User } from '../guard.js'
import { ByAuthor, EditPost, LikePost, PostChirp, Timeline, Unlike, likeOf } from '../operations.js'
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
/** Each create and edit the writers landed, by whose operation it was, so a retry is answered. */
const ledger = sqliteTable(
  'write_ledger',
  {
    scope: text('scope').notNull(),
    operation: text('operation').notNull(),
    target: text('target').notNull(),
    answer: text('answer').notNull(),
    at: integer('at').notNull(),
    request: text('request'),
  },
  table => [primaryKey({ columns: [table.scope, table.operation, table.target] })],
)
// #endregion

// #region implement
const admins = new Set(['ada'])

export const Policy = G.implement({
  isAdmin: principal => Option.exists(principal, user => admins.has(user.id)),
})
// #endregion

// #region bind
const Db = bind(
  { User: Chirper, Post, Like },
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
      visible: GuardDrizzle.visible(Policy, [Like]).Like,
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
  create table write_ledger (
    scope text not null, operation text not null, target text not null,
    answer text not null, at integer not null, request text,
    primary key (scope, operation, target)
  );
  create index write_ledger_at on write_ledger (at);
`
// #endregion

/**
 * A like's id is `likeOf` its post and its liker, whom the server sets, so
 * one under any other id is refused: under another's, it would take the id
 * their own like needs. No rule can say so, as no operator joins two texts,
 * so the writer checks it, behind the guards.
 */
const ownLikes = (
  likes: EntityWriter<Option.Option<User>, DrizzleDatabase>,
): EntityWriter<Option.Option<User>, DrizzleDatabase> => ({
  ...likes,
  insert: context => {
    const linked = (relation: string) =>
      Option.flatten(Option.fromUndefinedOr(context.links[relation]))
    const own = Option.zipWith(linked('post'), linked('user'), (post, user) =>
      likeOf(post.id, user.id),
    )
    return Option.exists(own, id => id === context.id)
      ? likes.insert(context)
      : Effect.fail(RemoteServer.forbid())
  },
})

/**
 * A chirp's or a like's id is the browser's, so a create sent again finds it
 * taken. The ledger tells a retry, the same operation from the same person,
 * from another create of that id: the retry is answered with its row.
 */
const ledgered = {
  ledger: {
    table: ledger,
    scope: (principal: Option.Option<User>) =>
      Option.match(principal, { onNone: () => '', onSome: user => user.id }),
  },
}

// Every write is decided by its rules before it lands. Who wrote a chirp or
// made a like, and when, the Entities set from the context: the browser sends neither.
const guarded = GuardServer.writer(Post, Policy, writer(Db.Post, ledgered))
const likeWrites = GuardServer.writer(Like, Policy, ownLikes(writer(Db.Like, ledgered)))

export const server = RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
  entities: [
    source(Db.User),
    // `liked` is each reader's own: the source answers it for the server's `viewer`.
    source(Db.Post, { filter: GuardServer.filter(Post, Policy) }),
    source(Db.Like, { filter: GuardServer.filter(Like, Policy) }),
  ],
  queries: [query(Timeline, { entity: Db.Post }), query(ByAuthor, { entity: Db.Post })],
  mutations: [
    RemoteServer.write(PostChirp, guarded),
    RemoteServer.write(EditPost, guarded),
    RemoteServer.write(LikePost, likeWrites),
    RemoteServer.write(Unlike, likeWrites),
  ],
  // Who is asking, as the row an `Expr.viewer` or a `liked` names: the guard set's.
  viewer: Policy.viewer,
})

// A guarded Entity served without its rule would serve every row: refuse to start.
GuardServer.validate(Policy, {
  entities: [Post, Like],
  domain: Remote.define({ entities: [Chirper, Post, Like], queries: [Timeline, ByAuthor] }),
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
