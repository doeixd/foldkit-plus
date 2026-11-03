/**
 * The page cache takes every store, `CacheStore.kv` with `keep` included
 * (#468): a page carries when each of its reads was made.
 */
import type { PageCache } from 'foldkit-ssr'
import { CacheStore, type WorkersCache, type WorkersKv } from 'foldkit-surface'

declare const namespace: WorkersKv
declare const workersCache: WorkersCache

const pages = (store: PageCache['store']): PageCache => ({ maxAge: '1 minute', store })

pages(CacheStore.memory())
pages(CacheStore.workers(workersCache))
pages(CacheStore.kv(namespace))
pages(CacheStore.kv(namespace, { keep: '6 hours' }))
