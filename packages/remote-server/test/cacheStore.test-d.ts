/**
 * `serveFetch` keeps reads only in a store that serves nothing past its
 * `maxAge` (#468): a read's answer carries no age, so a `PageCacheStore`
 * (`CacheStore.kv` with `keep`) is refused.
 */
import { Duration, Effect, Layer } from 'effect'
import { CacheStore, type WorkersCache, type WorkersKv } from 'foldkit-remote'
import { serveFetch } from '../src/fetch.js'
import { RemoteServer } from '../src/index.js'

declare const namespace: WorkersKv
declare const workersCache: WorkersCache

const served = (store: CacheStore) =>
  serveFetch({
    server: RemoteServer.make<string>({ entities: [] }),
    resolvePrincipal: () => Effect.succeed('visitor'),
    layer: () => Layer.empty,
    cache: { store, visitor: 'visitor' },
  })

served(CacheStore.memory())
served(CacheStore.workers(workersCache))
served(CacheStore.kv(namespace))

serveFetch({
  server: RemoteServer.make<string>({ entities: [] }),
  resolvePrincipal: () => Effect.succeed('visitor'),
  layer: () => Layer.empty,
  cache: {
    // @ts-expect-error a store that serves past maxAge would hand out stale reads as fresh
    store: CacheStore.kv(namespace, { keep: '1 hour' }),
    visitor: 'visitor',
  },
})

declare const keepOrNot: Duration.Input | undefined
// @ts-expect-error a keep that may be given is a keep
served(CacheStore.kv(namespace, { keep: keepOrNot }))
