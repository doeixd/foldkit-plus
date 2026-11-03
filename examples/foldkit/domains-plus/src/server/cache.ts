/**
 * Where the server keeps public reads and pages (#428, #468): reads in the
 * Worker's `caches.default` for their freshness, and pages in the
 * `PAGE_CACHE` KV namespace for hours; this process's memory on the dev
 * server and in Node. A write purging a price would reach only the reads'
 * store, but no request here writes.
 */
import { Option } from 'effect'
import { CacheStore, type WorkersCache, type WorkersKv } from 'foldkit-remote'

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

/**
 * How long a page is served after it was kept, past its reads' minute: the
 * browser reads the prices again once they are a minute old
 * (`client/app.ts`'s `freshness`), so the Worker renders a page once in this.
 */
const KEEP_PAGES = '6 hours'

const isWorkersKv = (value: unknown): value is WorkersKv =>
  typeof value === 'object' && value !== null && 'get' in value && 'put' in value

/**
 * The `PAGE_CACHE` binding, where the runtime is workerd. The specifier is
 * hidden from Vite, which would try to resolve it; in Node the import fails.
 */
const pageCache = async (): Promise<Option.Option<WorkersKv>> => {
  const specifier = 'cloudflare:workers'
  try {
    const workers: unknown = await import(/* @vite-ignore */ specifier)
    const env: unknown =
      typeof workers === 'object' && workers !== null ? Reflect.get(workers, 'env') : undefined
    const binding: unknown =
      typeof env === 'object' && env !== null ? Reflect.get(env, 'PAGE_CACHE') : undefined
    return isWorkersKv(binding) ? Option.some(binding) : Option.none()
  } catch {
    return Option.none()
  }
}

/** Where pages are kept: KV for `KEEP_PAGES` on the Worker, else beside the reads. */
export const pageStore = Option.match(await pageCache(), {
  onNone: () => store,
  onSome: namespace => CacheStore.kv(namespace, { keep: KEEP_PAGES }),
})
