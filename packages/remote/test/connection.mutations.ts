/**
 * An empty, whole page kept as evidence, broken in turn:
 * `pnpm mutate packages/remote/test/connection.mutations.ts`.
 */
const file = '../src/connection.ts'
const tests = ['packages/remote/test/connection.test.ts', 'examples/cloudflare/test/order.test.ts']

export default [
  {
    name: 'an empty, whole page is ignored like any empty page',
    edits: [
      {
        file,
        find: 'return whole && current.segments.length === 0 ? { ...current, segments: [incoming] } : current',
        replace: 'return current',
      },
    ],
    tests,
  },
  {
    name: 'an empty page that only ends the list is kept',
    edits: [
      {
        file,
        find: "const whole = incoming.start._tag === 'Terminal' && incoming.end._tag === 'Terminal'",
        replace: "const whole = incoming.end._tag === 'Terminal'",
      },
    ],
    tests,
  },
  {
    name: 'an empty page that only starts the list is kept',
    edits: [
      {
        file,
        find: "const whole = incoming.start._tag === 'Terminal' && incoming.end._tag === 'Terminal'",
        replace: "const whole = incoming.start._tag === 'Terminal'",
      },
    ],
    tests,
  },
  {
    name: 'an empty, whole page replaces the rows held',
    edits: [
      {
        file,
        find: 'return whole && current.segments.length === 0 ?',
        replace: 'return whole ?',
      },
    ],
    tests,
  },
]
