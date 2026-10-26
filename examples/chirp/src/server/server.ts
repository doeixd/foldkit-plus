/**
 * The server: the domain's Entities bound to SQLite tables, the guards' bodies,
 * and Remote's server over them. The database is passed in: Node's own SQLite
 * for the tests (`sqlite-node.ts`), SQLite compiled to WebAssembly for the
 * published demo, which runs this server in the browser (`host.ts`).
 */
import { and, eq } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Effect, Option } from 'effect'
import { GuardDrizzle } from 'foldkit-guard/drizzle'
import { GuardServer } from 'foldkit-guard/server'
import { Remote, REMOTE_PROTOCOL_VERSION } from 'foldkit-remote'
import {
  bind,
  databaseLayer,
  drizzleWrites,
  query,
  runStatement,
  source,
  writer,
  type DrizzleDatabase,
} from 'foldkit-remote-drizzle'
import { RemoteServer, RemoteServerError } from 'foldkit-remote-server'
import { Chirp } from '../domain.js'
import { G, Post, type User } from '../guard.js'
import { ByAuthor, EditPost, PostChirp, Timeline, ToggleLike } from '../operations.js'
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
      derived: { likeCount: { relation: 'likedBy' }, may: { supplied: true } },
    },
  },
)

// Every write of a post is decided by its rules before it lands. Who wrote a
// chirp, and when, are the server's to say: the browser sends neither.
const guarded = GuardServer.writer(Post, Policy, writer(Db.Post), {
  presets: { authorId: user => user.id, createdAt: () => Date.now() },
})

/**
 * A like, toggled: taken back where the asker had one, made where not. The
 * answer is the post read back as the asker would read it, so the client's
 * store learns the new count and who liked it.
 */
const toggleLike = RemoteServer.mutation(
  ToggleLike,
  ({
    input,
    principal,
  }: {
    readonly input: { readonly postId: string }
    readonly principal: Option.Option<User>
  }) =>
    Effect.gen(function* () {
      if (Option.isNone(principal)) return yield* RemoteServer.forbid('Sign in to like a post.')
      const userId = principal.value.id
      const database = yield* drizzleWrites
      const mine = and(eq(likes.postId, input.postId), eq(likes.userId, userId))
      const taken = yield* runStatement(
        () => database.delete(likes).where(mine).returning({ postId: likes.postId }),
        'Could not take the like back',
      )
      if (taken.length === 0)
        yield* runStatement(
          () => database.insert(likes).values({ postId: input.postId, userId }),
          'Could not like the post',
        )
      const answer = yield* RemoteServer.handlers(server, principal)
        .FoldkitRemoteRead({
          version: REMOTE_PROTOCOL_VERSION,
          requests: [{ entity: 'Post', id: input.postId, fields: ['likeCount', 'likedBy'] }],
        })
        .pipe(Effect.mapError(error => new RemoteServerError({ message: error.message })))
      return { output: { liked: taken.length === 0 }, entities: answer.entities }
    }),
)

export const server: ReturnType<typeof RemoteServer.make<Option.Option<User>, DrizzleDatabase>> =
  RemoteServer.make<Option.Option<User>, DrizzleDatabase>({
    entities: [source(Db.User), source(Db.Post, { filter: GuardServer.filter(Post, Policy) })],
    queries: [query(Timeline, { entity: Db.Post }), query(ByAuthor, { entity: Db.Post })],
    mutations: [
      RemoteServer.write(PostChirp, guarded),
      RemoteServer.write(EditPost, guarded),
      toggleLike,
    ],
  })

// A guarded Entity served without its rule would serve every row: refuse to start.
GuardServer.validate(Policy, {
  entities: [Post],
  domain: Remote.define({ entities: [Chirp.User, Post], queries: [Timeline, ByAuthor] }),
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
