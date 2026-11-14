/**
 * The fixture's seeding, holding and headers, broken in turn:
 * `pnpm mutate packages/remote-domain/test/adapter/testing.mutations.ts`.
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
        find: 'next[at] = { ...(next[at] as object | undefined), headers }',
        replace: 'next[at] = next[at]',
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
