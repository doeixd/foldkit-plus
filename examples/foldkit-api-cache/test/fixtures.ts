/**
 * Models with server data in them, put there the only way Remote allows: its
 * own reads, reduced through its reducer. `RemoteServer.memory` answers them
 * from the rows below, with no latency and no flakiness, dated `FETCHED_AT`.
 */
import { Effect, Option } from 'effect'
import { modifyFields } from 'foldkit/struct'
import { Remote, entityKey } from 'foldkit-remote'
import type { Projection } from 'foldkit-surface'
import { RemoteServer } from 'foldkit-remote-server'

import * as UiTabs from '@foldkit/ui/tabs'
import { Post, PostsQuery, STATS_ID } from '../src/data.js'
import { Data, Message, type Model, TABS_ID, postDetail, postList, stats } from '../src/main.js'

/**
 * Now, when the tests start: Remote's read entries judge age against
 * `Date.now`, so a fixed date in the past would read as long expired to a
 * test that does not fake the date.
 */
export const FETCHED_AT = Date.now()

const rows = {
  Post: [
    {
      id: 'first-post',
      title: 'First Post',
      excerpt: 'The first fixture post.',
      author: 'Grace Hopper',
      body: 'The whole body of the first fixture post.',
    },
    {
      id: 'second-post',
      title: 'Second Post',
      excerpt: 'The second fixture post.',
      author: 'Alan Kay',
      body: 'The whole body of the second fixture post.',
    },
  ],
  Stats: [
    {
      id: STATS_ID,
      activeUsers: 120,
      requestsPerSecond: 1234,
      cacheHitRatePercent: 97,
      sampledAt: FETCHED_AT,
    },
  ],
}

const backend = RemoteServer.memory({
  domain: Data,
  rows,
  queries: [
    RemoteServer.query(PostsQuery, () =>
      Effect.succeed({
        edges: rows.Post.map(({ id }) => ({
          entity: Post.name,
          id,
          key: entityKey(Post.name, id),
        })),
        start: { _tag: 'Terminal' as const },
        end: { _tag: 'Terminal' as const },
      }),
    ),
  ],
})

/** The Model with what `projection` reads fetched from the rows above. */
const load = (model: Model, projection: Projection<Model, unknown>): Promise<Model> =>
  Effect.runPromise(
    Data.prefetch(model, projection, { now: () => FETCHED_AT }).pipe(Effect.provide(backend.layer)),
  )

export const loadingPostsModel: Model = {
  tabs: UiTabs.init({ id: TABS_ID }),
  activeTab: 'Posts',
  maybeSelectedPostId: Option.none(),
  remote: Remote.initial,
}

export const loadedPostsModel = await load(loadingPostsModel, postList)

export const cachedFirstPostModel = await load(loadedPostsModel, postDetail('first-post'))

export const loadedStatsModel = await load(
  modifyFields(loadedPostsModel, { activeTab: () => 'Stats' as const }),
  stats,
)

/** Remote's own Message for a read of `projection` that failed with `error`. */
export const failedRead = (
  model: Model,
  projection: Projection<Model, unknown>,
  error: string,
): Message =>
  Message.GotRemoteMessage({
    message: {
      _tag: 'ReadFailed',
      requests: Data.plan(model, projection),
      error: { _tag: 'RemoteReadError', message: error },
    },
  })
