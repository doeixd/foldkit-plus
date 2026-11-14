/**
 * A caller's own deadline, ahead of the client's: `pnpm mutate
 * packages/remote/test/callTimeout.mutations.ts`.
 */
const tests = ['packages/remote/test/deadline.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'the caller’s deadline is never set',
    '../src/deadline.ts',
    'timeout === undefined ? effect : Effect.provideService(effect, CallTimeout, Option.some(timeout))',
    'effect',
  ),
  edit(
    'the client’s deadline beats the caller’s',
    '../src/deadline.ts',
    'Option.getOrUndefined(yield* CallTimeout) ?? client',
    'client ?? Option.getOrUndefined(yield* CallTimeout)',
  ),
  edit(
    'a send ignores its own timeout',
    '../src/client.ts',
    '    }),\n    options.timeout,\n  )',
    '    }),\n    undefined,\n  )',
  ),
  edit(
    'a read ignores the entry’s timeout',
    '../src/domain.ts',
    'withCallTimeout(readMessage(requirements, after, now, generation), timeout)',
    'readMessage(requirements, after, now, generation)',
  ),
  edit(
    'a query ignores the entry’s timeout',
    '../src/domain.ts',
    'withCallTimeout(queryMessage(query, now, generation), timeout)',
    'queryMessage(query, now, generation)',
  ),
]
