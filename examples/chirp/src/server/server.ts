/**
 * The server: the domain's Entities bound to SQLite tables, the guards' bodies,
 * and Remote's server over them. The database is passed in: Node's own SQLite
 * for the tests (`sqlite-node.ts`), SQLite compiled to WebAssembly for the
 * published demo, which runs this server in the browser (`host.ts`).
 */
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Option } from 'effect'
import { GuardDrizzle } from 'foldkit-guard/drizzle'
import { GuardServer } from 'foldkit-guard/server'
import { Remote } from 'foldkit-remote'
import {
  bind,
  databaseLayer,
  query,
  source,
  writer,
  type DrizzleDatabase,
} from 'foldkit-remote-drizzle'
import { RemoteServer } from 'foldkit-remote-server'
import { Chirp } from '../domain.js'
import { G, Me, Post, type User } from '../guard.js'
import { EditPost, PostChirp, Timeline } from '../operations.js'
import { SEED } from './seed.js'

/** A SQLite database the server runs on, and whether it is new, so needs its tables. */
export interface Sqlite {
  readonly fresh: boolean
  readonly exec: (statements: string) => void
  /** The Drizzle database over it, for `databaseLayer`. */
  readonly drizzle: unknown
}

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
  postId: text('post_id').notNull(),
  userId: text('user_id').notNull(),
})

const SCHEMA = `
  create table users (id text primary key, handle text not null, name text not null);
  create table posts (
    id text primary key,
    author_id text not null references users(id),
    body text not null check (length(body) <= 280),
    created_at integer not null
  );
  create table likes (
    post_id text not null references posts(id),
    user_id text not null references users(id),
    primary key (post_id, user_id)
  );
`

// #region implement
const admins = new Set(['ada'])

export const Policy = G.implement({
  isAdmin: principal => Option.exists(principal, user => admins.has(user.id)),
})
// #endregion

const Db = bind(
  { User: Chirp.User, Post },
  {
    User: { table: users, relations: { posts: { foreignKey: posts.authorId } } },
    Post: {
      table: posts,
      visible: GuardDrizzle.visible(Policy, [Post]).Post,
      relations: {
        author: { field: posts.authorId },
        likedBy: { through: likes, localColumn: likes.postId, foreignColumn: likes.userId },
      },
      derived: { likeCount: { relation: 'likedBy' } },
    },
  },
)

// Every write of a post is decided by its rules before it lands; the server, not
// the browser, says when a chirp was posted.
const guarded = GuardServer.writer(Post, Policy, writer(Db.Post), {
  presets: { createdAt: () => Date.now() },
})

export const server = RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
  entities: [
    source(Db.User),
    source(Db.Post, { filter: GuardServer.filter(Post, Policy) }),
    GuardServer.me(Me, Policy),
  ],
  queries: [query(Timeline, { entity: Db.Post })],
  mutations: [RemoteServer.write(PostChirp, guarded), RemoteServer.write(EditPost, guarded)],
})

// A guarded Entity served without its rule would serve every row: refuse to start.
GuardServer.validate(Policy, {
  entities: [Post, Me],
  domain: Remote.define({ entities: [Chirp.User, Post], queries: [Timeline] }),
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
