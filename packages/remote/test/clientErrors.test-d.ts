/**
 * `RemoteClient`'s error types say what the transports do: a read, a query
 * or a mutation nothing answered fails `RemoteUnreachable` (#361).
 */
import { Effect, Stream } from 'effect'
import { expectTypeOf } from 'vitest'
import {
  Remote,
  RemoteLiveError,
  RemoteUnreachable,
  type RemoteClient,
  type RemoteJsonClient,
} from '../src/index.js'

const json: RemoteJsonClient = Remote.json(() => Promise.resolve({}))

// A client written by hand over `Remote.json` takes its calls as they are.
export const overJson: RemoteClient['Service'] = {
  read: json.FoldkitRemoteRead,
  query: json.FoldkitRemoteQuery,
  mutate: json.FoldkitRemoteMutate,
  live: () => Stream.never,
}

// Code reading a call's errors sees the case.
expectTypeOf<RemoteUnreachable>().toExtend<
  Effect.Error<ReturnType<RemoteClient['Service']['read']>>
>()
expectTypeOf<RemoteUnreachable>().toExtend<
  Effect.Error<ReturnType<RemoteClient['Service']['query']>>
>()

export const refused: RemoteClient['Service'] = {
  ...overJson,
  // @ts-expect-error a live stream's error is no read's
  read: () => Effect.fail(new RemoteLiveError({ message: 'lost' })),
}
