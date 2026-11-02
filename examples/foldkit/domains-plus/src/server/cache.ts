/**
 * Where the server keeps public reads and pages (#428): the Worker's
 * `caches.default`, or this process's memory on the dev server and in Node.
 * Both `/remote` and the pages use one store, so a write purging a price
 * would drop the pages that show it too.
 */
import { CacheStore, type WorkersCache } from 'foldkit-remote'

const isWorkersCache = (value: unknown): value is WorkersCache =>
  typeof value === 'object' &&
  value !== null &&
  'match' in value &&
  'put' in value &&
  'delete' in value

/** The Workers Cache API's `caches.default`, where the runtime has one. */
const workersCache = (): WorkersCache | undefined => {
  const caches: unknown = Reflect.get(globalThis, 'caches')
  return typeof caches === 'object' &&
    caches !== null &&
    'default' in caches &&
    isWorkersCache(caches.default)
    ? caches.default
    : undefined
}

const platform = workersCache()

export const store = platform === undefined ? CacheStore.memory() : CacheStore.workers(platform)
