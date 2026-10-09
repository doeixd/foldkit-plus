/**
 * Membership, broken one arm at a time:
 * `pnpm mutate examples/cloudflare/test/live.mutations.ts`
 *
 * The D1 stream is asserted in `cloudflare.test.ts`. esbuild bundles that
 * worker from the files, so a mutation applied to Vite's modules never
 * reaches `pollLive`.
 */
const live = '../src/live.ts'
const tests = ['examples/cloudflare/test/live.test.ts']

export default [
  {
    name: 'every difference is silence',
    edits: [
      {
        file: live,
        find: 'if (added.length === 0 && removed.length === 0) return undefined\n  return { added, removed }',
        replace: 'return undefined',
      },
    ],
    tests,
  },
  {
    name: 'an id that joined is not reported',
    edits: [
      { file: live, find: 'return { added, removed }', replace: 'return { added: [], removed }' },
    ],
    tests,
  },
  {
    name: 'an id that left is not reported',
    edits: [
      { file: live, find: 'return { added, removed }', replace: 'return { added, removed: [] }' },
    ],
    tests,
  },
]
