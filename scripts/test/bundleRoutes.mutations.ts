/**
 * The bundle report's per-route figures:
 * `pnpm mutate scripts/test/bundleRoutes.mutations.ts`.
 */
const file = '../bundle-report.mjs'
const tests = ['scripts/test/bundleRoutes.test.ts']

export default [
  {
    name: 'a module the entry reaches is a route’s own',
    edits: [{ file, find: 'const base = reach(entries, all)', replace: 'const base = new Set()' }],
    tests,
  },
  {
    name: 'a module two routes reach is each one’s',
    edits: [{ file, find: 'other === name || !set.has(id)', replace: 'true' }],
    tests,
  },
  {
    name: 'a route’s walk passes through another route’s root',
    edits: [
      {
        file,
        find: 'reach(own, new Set([...all].filter(id => !own.includes(id))))',
        replace: 'reach(own, new Set())',
      },
    ],
    tests,
  },
  {
    name: 'a route’s own modules are not walked below its root',
    edits: [
      { file, find: 'for (const next of graph[id]?.imports ?? []) visit(next)', replace: '' },
    ],
    tests,
  },
  {
    name: 'the route’s share of its chunk is its whole chunk',
    edits: [{ file, find: 'alone += chunk.brotli * share', replace: 'alone += chunk.brotli' }],
    tests,
  },
  {
    name: 'a split route’s own chunk is not in its first load',
    edits: [{ file, find: 'visit(holder[0])', replace: '' }],
    tests,
  },
  {
    name: 'a split route’s static imports are not in its first load',
    edits: [
      {
        file,
        find: 'for (const next of entry?.imports ?? []) visit(manifestByKey[next]?.file)',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a route is split whatever chunk holds it',
    edits: [{ file, find: 'loaded !== null && !loaded.has(holder[0])', replace: 'true' }],
    tests,
  },
  {
    name: 'the landing route is not marked',
    edits: [{ file, find: 'landing: route.landing === true,', replace: 'landing: false,' }],
    tests,
  },
]
