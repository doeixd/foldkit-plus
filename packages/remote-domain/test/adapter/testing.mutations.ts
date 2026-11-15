/**
 * The fixture's seeding, holding and headers, broken in turn:
 * `pnpm mutate packages/remote-domain/test/adapter/testing.mutations.ts`.
 * What its layer requires (`Unmet`) is a type, held by `test/types.test-d.ts`,
 * which `tsc -b` checks.
 */
const tests = ['packages/remote-domain/test/adapter/testing.test.ts']

export default [
  {
    name: 'the given events are not seeded',
    edits: [
      {
        file: '../../src/testing.ts',
        find: 'of config.given ?? []',
        replace: 'of []',
      },
    ],
    tests,
  },
  {
    name: 'a View delivery is not held until drained',
    edits: [{ file: '../../src/testing.ts', find: 'manual: true', replace: 'manual: false' }],
    tests,
  },
  {
    name: 'a call carries no actor headers',
    edits: [
      {
        file: '../../src/testing.ts',
        find: 'headers: { ...headers, ...options?.headers } }',
        replace: 'headers: { ...options?.headers } }',
      },
    ],
    tests,
  },
  {
    name: 'a call’s own headers are replaced by the actor’s',
    edits: [
      {
        file: '../../src/testing.ts',
        find: 'headers: { ...headers, ...options?.headers } }',
        replace: 'headers }',
      },
    ],
    tests,
  },
  {
    name: 'a command takes its options second, as a read does',
    edits: [{ file: '../../src/testing.ts', find: 'commands.has(name) ? 2 : 1', replace: '1' }],
    tests,
  },
  {
    name: 'a live read is built as an Effect, so its headers arrive as no headers',
    edits: [{ file: '../../src/testing.ts', find: 'streamed.has(read)', replace: 'false' }],
    tests,
  },
]
