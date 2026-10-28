/**
 * A list body over a link, judged over the store, broken in turn:
 * `pnpm mutate packages/remote/test/link.mutations.ts`.
 */
const tests = ['packages/remote/test/link.test.ts']
const held = '../../entity/src/held.ts'

export default [
  {
    name: 'the store is judged with its ref keys',
    edits: [
      {
        file: '../src/matching.ts',
        find: 'const values = Held.fromRefs(body, entry.values)',
        replace: 'const values = entry.values',
      },
    ],
    tests,
  },
  {
    name: 'a link that is no ref key is compared as it is',
    edits: [{ file: held, find: '    if (separator === -1) {', replace: '    if (false) {' }],
    tests,
  },
  {
    name: 'a ref key keeps its Entity',
    edits: [
      {
        file: held,
        find: 'read[key] = (ref as string).slice(separator + 1)',
        replace: 'read[key] = ref',
      },
    ],
    tests,
  },
]
