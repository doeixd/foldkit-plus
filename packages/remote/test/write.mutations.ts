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
        find: ': [DomainWrite.bind(mutation.write, input as never, options.keys)]',
        replace: ': undefined',
      },
    ],
    tests,
  },
  {
    name: 'the keys do not narrow what is shown',
    edits: [
      {
        file: '../src/index.ts',
        find: 'DomainWrite.bind(mutation.write, input as never, options.keys)',
        replace: 'DomainWrite.bind(mutation.write, input as never)',
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
]
