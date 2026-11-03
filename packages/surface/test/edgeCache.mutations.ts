/**
 * Cache stores, each guard broken in turn:
 * `pnpm mutate packages/surface/test/edgeCache.mutations.ts`
 */
const tests = ['packages/surface/test/edgeCache.test.ts']
// The KV store also runs on workerd, where KV itself refuses a TTL under a minute.
const kvTests = [...tests, 'packages/plus/test/workers.kvCache.test.ts']
const store = '../src/edgeCache.ts'
const edit = (name: string, find: string, replace: string, on = tests) => ({
  name,
  edits: [{ file: store, find, replace }],
  tests: on,
})

export default [
  edit('an expired answer is served', 'if (entry.expires <= now) {', 'if (false) {'),
  edit('memory keeps every answer', 'if (entries.size <= limit) break', 'break'),
  edit(
    'a purge drops nothing in memory',
    'for (const key of index.take(tags)) entries.delete(key)',
    '',
  ),
  edit(
    'the Workers store keeps forever',
    "headers: { 'cache-control': `max-age=${maxAgeSeconds({ maxAge })}` },",
    'headers: {},',
  ),
  edit(
    'the Workers store purges nothing',
    'Promise.all([...index.take(tags)].map(key => cache.delete(new Request(key)))),',
    'Promise.resolve(),',
  ),
  edit('KV writes on the first ask', 'if (!askedOnce.delete(key)) {', 'if (false) {', kvTests),
  edit('KV remembers every key asked once', 'if (askedOnce.size <= KV_ASKED_ONCE) break', 'break'),
  edit(
    'KV is asked for a TTL under its floor',
    'expirationTtl: Math.max(KV_SHORTEST_TTL, Math.ceil(lasts / 1000)),',
    'expirationTtl: Math.ceil(lasts / 1000),',
    kvTests,
  ),
  edit(
    'KV serves an answer past its maxAge',
    'return space > 0 && Number(value.slice(0, space)) > now',
    'return space > 0',
  ),
  edit(
    'KV ignores keep',
    'Duration.toMillis(Duration.max(maxAge, keep))',
    'Duration.toMillis(maxAge)',
  ),
  edit('KV takes a keep that never ends', 'if (!Duration.isFinite(keep)) {', 'if (false) {'),
  edit(
    'KV purges nothing',
    'Promise.all([...index.take(tags)].map(key => namespace.delete(key))),',
    'Promise.resolve(),',
    kvTests,
  ),
  edit(
    'a failed KV read fails the request',
    'Effect.catch(cause => Effect.as(warn(`read ${key}`)(cause), Option.none())),',
    '',
    kvTests,
  ),
  edit('a refused KV write fails the request', 'Effect.catch(warn(`keep ${key}`)),', '', kvTests),
  edit(
    'a failed KV purge fails the request',
    "Effect.catch(warn(`purge ${tags.join(', ')}`))",
    'Effect.asVoid',
    kvTests,
  ),
]
