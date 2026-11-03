/**
 * A Worker keeping answers in `CacheStore.kv` over its KV binding, for
 * `workers.kvCache.test.ts`: `/put` keeps `body` under `key` for `maxAge`
 * seconds with each `tag`, `/get` answers what is kept (404 when nothing),
 * `/purge` drops what each `tag` names. Under `/down/` the store reads and
 * writes through a namespace that fails every call.
 */
import { Duration, Effect, Option } from 'effect'
import { CacheStore, type WorkersKv } from 'foldkit-surface'

export interface Env {
  readonly CACHE: WorkersKv
}

const unavailable = () => Promise.reject(new Error('KV is unavailable'))
const down: WorkersKv = { get: unavailable, put: unavailable, delete: unavailable }

// One store of each per isolate, as an application's module keeps one: it counts the asking.
const stores = new Map<string, CacheStore>()
const storeOf = (name: string, namespace: WorkersKv): CacheStore => {
  const held = stores.get(name) ?? CacheStore.kv(namespace)
  stores.set(name, held)
  return held
}

export default {
  fetch: async (request: Request, env: Env): Promise<Response> => {
    const url = new URL(request.url)
    const isDown = url.pathname.startsWith('/down/')
    const store = isDown ? storeOf('down', down) : storeOf('up', env.CACHE)
    const key = `${url.origin}/__foldkit/cache/test/${url.searchParams.get('key') ?? ''}`
    const tags = url.searchParams.getAll('tag')
    switch (url.pathname.replace('/down', '')) {
      case '/put':
        await Effect.runPromise(
          store.put(key, url.searchParams.get('body') ?? '', {
            maxAge: Duration.seconds(Number(url.searchParams.get('maxAge') ?? '60')),
            tags,
          }),
        )
        return new Response('served')
      case '/get':
        return Option.match(await Effect.runPromise(store.match(key)), {
          onNone: () => new Response('miss', { status: 404 }),
          onSome: body => new Response(body),
        })
      case '/purge':
        await Effect.runPromise(store.purge(tags))
        return new Response('purged')
      default:
        return new Response('not found', { status: 404 })
    }
  },
}
