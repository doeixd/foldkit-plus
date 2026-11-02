/**
 * Cache stores, each guard broken in turn:
 * `pnpm mutate packages/surface/test/edgeCache.mutations.ts`
 */
const tests = ['packages/surface/test/edgeCache.test.ts']
const store = '../src/edgeCache.ts'
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: store, find, replace }],
  tests,
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
]
