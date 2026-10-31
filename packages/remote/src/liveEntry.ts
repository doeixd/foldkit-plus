/**
 * A live entry as the core keeps it (#378): what it asks for a Model, and
 * where it resumes. Its stream is the live capability's, which a live read
 * installs, so a page that reads nothing live keeps none of it.
 */
import { Result, Schema, Stream } from 'effect'
import type { EntryWithoutKeepAlive } from 'foldkit/subscription'
import type { Asked } from './active.js'
import { Capability, liveIn } from './capability.js'
import type { RemoteClient } from './client.js'
import type { BoundRemote, LiveDependencies, LiveOptions } from './index.js'
import { liveStreamKey, type LiveAsk } from './liveState.js'
import type { RemoteMessage, RemoteModel } from './model.js'
import { parsedQueryRequest } from './queryRequest.js'
import { QueryRequest, ReadRequest } from './wire.js'

/**
 * The live rows and lists of what projections ask. A list read live is a
 * `Data.query`, whose identity is always a query's, so one that is not is
 * this package's bug, and throws.
 */
export const liveAskOf = (asked: Asked): LiveAsk => ({
  requirements: asked.requirements.filter(requirement => requirement.live === true),
  queries: asked.connections.flatMap(connection =>
    connection.live === true ? [Result.getOrThrow(parsedQueryRequest(connection))] : [],
  ),
})

// Where a restarted stream resumes, not a reason to restart it: every applied
// event advances the cursor, and a restart per event would close and reopen
// the server stream each time. Said in the schema rather than with Foldkit's
// `keepAliveEquivalence`, which would change the entry's public type
// (`EntryWithoutKeepAlive`, the only entry type Foldkit exports) for every
// application that spreads Remote's entries into its own.
const resumeCursor = Schema.Number.pipe(Schema.overrideToEquivalence(() => () => true))

/** The live entry: subscribes to `liveOf(model)` from the Model's resume cursor. */
export const liveEntry = <AppModel, Store extends RemoteModel, Message>(
  bound: BoundRemote<AppModel, Store>,
  liveOf: (model: AppModel) => LiveAsk,
  toMessage: (message: RemoteMessage) => Message,
  options: LiveOptions,
): EntryWithoutKeepAlive<AppModel, Message, LiveDependencies, RemoteClient> => ({
  dependenciesSchema: Schema.Struct({
    requirements: Schema.Array(ReadRequest),
    queries: Schema.Array(QueryRequest),
    cursor: resumeCursor,
    floor: Schema.Number,
    restarts: Schema.Number,
    // Read when a break restarts the stream; an applied event resetting it is no reason to.
    failures: resumeCursor,
  }),
  modelToDependencies: model => {
    const asked = liveOf(model)
    const stream = liveStreamKey(asked)
    const remote = bound.store.get(model)
    const health = remote.streams[stream]
    return {
      requirements: asked.requirements,
      queries: asked.queries,
      cursor: remote.live[stream]?.cursor ?? 0,
      // A stream is the principal's: `forget` moves the floor, and it restarts.
      floor: remote.refresh.floor,
      restarts: health?.restarts ?? 0,
      failures: health?.failures ?? 0,
    }
  },
  // The stream is the live capability's, which a live read installed before
  // any ask could name a row or list to watch.
  dependenciesToStream: dependencies =>
    dependencies.requirements.length === 0 && dependencies.queries.length === 0
      ? Stream.empty
      : liveIn(bound[Capability]).stream(dependencies, toMessage, options),
})
