/**
 * A mutation's operation id, each step broken in turn:
 * `pnpm mutate packages/remote/test/operation.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = [
  'packages/remote/test/write.test.ts',
  'packages/remote/test/mutation.test.ts',
  'packages/remote-server/test/server.test.ts',
]
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a retry mints a new operation',
    '../src/index.ts',
    'Effect.sync(() => Option.getOrElse(known, mintOperation)),',
    'Effect.sync(mintOperation),',
  ),
  edit(
    'a failed request keeps no operation',
    '../src/mutation.ts',
    'const operations = new Map([...state.operations, [requestId, operation] as const])',
    'const operations = new Map(state.operations)',
  ),
  edit(
    'operations outlive the failure window',
    '../src/mutation.ts',
    'for (const id of operations.keys()) if (!failed.has(id)) operations.delete(id)',
    '',
  ),
  edit('every operation is the same', '../src/client.ts', 'globalThis.crypto.randomUUID()', "'op'"),
  edit(
    'the operation is not sent',
    '../src/client.ts',
    '    operation,\n    mutation: mutation.name,',
    '    mutation: mutation.name,',
  ),
  edit(
    'the wire takes any length',
    '../src/wire.ts',
    'Schema.isMaxLength(128),',
    'Schema.isMaxLength(100_000),',
  ),
  edit(
    'the wire takes any characters',
    '../src/wire.ts',
    'Schema.isPattern(/^[A-Za-z0-9:._-]+$/),',
    'Schema.isPattern(/./),',
  ),
  edit(
    'the server hands a Source no operation',
    '../../remote-server/src/index.ts',
    'operation: Option.fromUndefinedOr(payload.operation),',
    'operation: Option.none(),',
  ),
]
