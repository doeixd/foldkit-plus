/**
 * The fake API: what the server owns, declared once, and a server held in
 * memory that answers it slowly, sometimes wrongly, and with fresh numbers
 * every time. The client in `main.ts` reads the same Entities and Query; it
 * never calls anything here directly.
 */
import { Array, Clock, Duration, Effect, Random, Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Query, Remote, entityKey } from 'foldkit-remote'
import { RemoteServer, RemoteServerError } from 'foldkit-remote-server'

// DOMAIN

export const Post = Entity.define(
  'Post',
  Schema.Struct({
    id: Schema.String,
    title: Schema.String,
    excerpt: Schema.String,
    author: Schema.String,
    body: Schema.String,
  }),
)

/** One live reading of the service, under `STATS_ID`. */
export const Stats = Entity.define(
  'Stats',
  Schema.Struct({
    id: Schema.String,
    activeUsers: Schema.Number,
    requestsPerSecond: Schema.Number,
    cacheHitRatePercent: Schema.Number,
    sampledAt: Schema.Number,
  }),
)

export const STATS_ID = 'current'

/** Every post, in the order the server keeps them. */
export const PostsQuery = Query.make('Posts', {
  Input: {},
  Result: Query.connection(Post),
})

// SERVER

export const FLAKY_POST_ID = 'flaky-connection'

const SERVER_LATENCY = Duration.millis(700)

type Article = typeof Post.schema.Type

const articles: ReadonlyArray<Article> = [
  {
    id: 'model-is-the-cache',
    title: 'The Model Is the Cache',
    excerpt: 'Why a single source of truth needs no query client.',
    author: 'Maya Okafor',
    body: 'A cache is a place where fetched data lives between requests. In The Elm Architecture that place already exists: the Model. Remote keeps each entity once, field by field, and every view reads the same truth.',
  },
  {
    id: 'stale-while-revalidate',
    title: 'Stale-While-Revalidate, Explained',
    excerpt: 'Show the old data while the new data loads.',
    author: 'Theo Lindqvist',
    body: 'Dropping back to a spinner throws away perfectly good data. A Refreshing read carries the previous value while the fetch runs, so the screen never goes blank.',
  },
  {
    id: 'query-keys-are-names',
    title: 'Query Keys Are Just Names',
    excerpt: 'An entity and its fields replace stringly-typed keys.',
    author: 'Priya Raman',
    body: 'There is no key to design: a screen names the fields it needs of an entity, and the list and this page share the one copy of the title they both read.',
  },
  {
    id: 'invalidation-is-a-message',
    title: 'Invalidation Is a Message',
    excerpt: 'Marking data stale is a fact, not a framework feature.',
    author: 'Jonas Weber',
    body: 'Invalidation means the cached value can no longer be trusted. Dispatch a Message, mark the read Refreshing with Data.refresh, and the active read fetches it again. The whole policy is visible in update.',
  },
  {
    id: FLAKY_POST_ID,
    title: 'This Post Fails Every Other Fetch',
    excerpt: 'Open it to see the failed state, then retry.',
    author: 'Flaky McNetwork',
    body: 'You made it. The fake server failed your first attempt on purpose and succeeded on the retry, which is exactly the round trip a failed read plus a retry Message is for.',
  },
]

// NOTE: Module-level mutation simulates a flaky server so the failed read and
// its retry are reachable from the UI. The Foldkit app itself never mutates.
const flakyAttempts = { count: 0 }

const PostSource = RemoteServer.entity<undefined>(Post, {
  read: ({ ids, fields }) =>
    Effect.gen(function* () {
      yield* Effect.sleep(SERVER_LATENCY)

      // Only a read of the post's body fails: the list, which reads titles,
      // always loads.
      if (Array.contains(ids, FLAKY_POST_ID) && Array.contains(fields, 'body')) {
        flakyAttempts.count += 1

        if (flakyAttempts.count % 2 === 1) {
          return yield* new RemoteServerError({
            message: 'The connection dropped. Retry to fetch this post again.',
          })
        }
      }

      return Array.filter(articles, article => Array.contains(ids, article.id)).map(article => ({
        id: article.id,
        values: article,
      }))
    }),
})

const StatsSource = RemoteServer.entity<undefined>(Stats, {
  read: ({ ids }) =>
    Effect.gen(function* () {
      yield* Effect.sleep(SERVER_LATENCY)

      if (!Array.contains(ids, STATS_ID)) return []

      const reading = {
        id: STATS_ID,
        activeUsers: yield* Random.nextIntBetween(80, 140),
        requestsPerSecond: yield* Random.nextIntBetween(900, 1600),
        cacheHitRatePercent: yield* Random.nextIntBetween(86, 99),
        sampledAt: yield* Clock.currentTimeMillis,
      }
      return [{ id: STATS_ID, values: reading }]
    }),
})

const PostsSource = RemoteServer.query<undefined, never, {}>(PostsQuery, () =>
  Effect.gen(function* () {
    yield* Effect.sleep(SERVER_LATENCY)

    return {
      edges: articles.map(({ id }) => ({ entity: Post.name, id, key: entityKey(Post.name, id) })),
      start: { _tag: 'Terminal' as const },
      end: { _tag: 'Terminal' as const },
    }
  }),
)

const server = RemoteServer.make<undefined>({
  entities: [PostSource, StatsSource],
  queries: [PostsSource],
})

/** The `RemoteClient` the runtime is given: the server's handlers, in process. */
export const api = Remote.clientLayer(RemoteServer.handlers(server, undefined))
