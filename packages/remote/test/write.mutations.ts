/**
 * A mutation that is a `Write`, broken in turn:
 * `pnpm mutate packages/remote/test/write.mutations.ts`.
 */
const tests = ['packages/remote/test/write.test.ts']

export default [
  {
    name: 'a write shows nothing until the server answers',
    edits: [
      {
        file: '../src/index.ts',
        find: ': optimisticOfWrite(mutation.write, input, options.keys)',
        replace: ': undefined',
      },
    ],
    tests,
  },
  {
    name: 'the keys do not narrow what is shown',
    edits: [
      {
        file: '../src/mutation.ts',
        find: 'Update: () => [patchOfWrite(DomainWrite.bind(write, input as never, keys))],',
        replace: 'Update: () => [patchOfWrite(DomainWrite.bind(write, input as never))],',
      },
    ],
    tests,
  },
  {
    name: 'the keys are not sent',
    edits: [
      {
        file: '../src/client.ts',
        find: '...(keys === undefined ? {} : { keys }),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the write’s patch wins over the operations given',
    edits: [
      {
        file: '../src/index.ts',
        find: ': (options.optimistic ??',
        replace: ': (undefined ??',
      },
    ],
    tests,
  },
  {
    name: 'a relation is patched as its id, not its ref key',
    edits: [
      {
        file: '../src/mutation.ts',
        find: 'onNone: () => null, onSome: ref => entityKey(ref.entity, ref.id)',
        replace: 'onNone: () => null, onSome: ref => ref.id',
      },
    ],
    tests,
  },
  {
    name: 'an inserted row is shown without its id',
    edits: [
      {
        file: '../src/mutation.ts',
        find: 'return [{ ...patch, values: { id: patch.id, ...patch.values } }]',
        replace: 'return [patch]',
      },
    ],
    tests,
  },
]
