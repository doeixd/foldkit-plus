/**
 * A payload key named like an `Object.prototype` member, kept in the canonical
 * bytes: `pnpm mutate packages/durable/test/protoKey.mutations.ts`.
 */
export default [
  {
    name: 'the canonical form is built on a plain object',
    edits: [
      {
        file: '../src/journal.ts',
        find: 'const out: Record<string, unknown> = Object.create(null)',
        replace: 'const out: Record<string, unknown> = {}',
      },
    ],
    tests: ['packages/durable/test/journal.test.ts'],
  },
]
