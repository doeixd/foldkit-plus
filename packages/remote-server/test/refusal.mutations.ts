/**
 * Refusals as data, broken in turn: `pnpm mutate packages/remote-server/test/refusal.mutations.ts`.
 */
const tests = ['packages/remote-server/test/refusal.test.ts']
const server = '../src/index.ts'
const remote = '../../remote/src'

export default [
  {
    name: 'the refusal is sent as the Source made it, not encoded',
    edits: [
      {
        file: server,
        find: 'const encoded = yield* Schema.encodeUnknownEffect(Refusal)(refused.refusal).pipe(',
        replace: 'const encoded = yield* Effect.succeed(refused.refusal).pipe(',
      },
    ],
    tests,
  },
  {
    name: 'a refusal made for another mutation is sent anyway',
    edits: [
      {
        file: server,
        find: 'if (refused.mutation !== mutation) return yield* invalid',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a refused mutation answers 500',
    edits: [
      {
        file: server,
        find: ': { status: 422 as const',
        replace: ': { status: 500 as const',
      },
    ],
    tests,
  },
  {
    name: 'the JSON client drops the refusal',
    edits: [
      {
        file: `${remote}/json.ts`,
        find: 'new RemoteMutationError({ message: error, refusal })',
        replace: 'new RemoteMutationError({ message: error })',
      },
    ],
    tests,
  },
  {
    name: 'the Model drops the refusal',
    edits: [
      {
        file: `${remote}/client.ts`,
        find: '...(error.refusal === undefined ? {} : { refusal: error.refusal }),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the refusal is read as sent, not decoded',
    edits: [
      {
        file: `${remote}/index.ts`,
        find: ': Schema.decodeUnknownOption(mutation.Refusal)(refusal)',
        replace: ': Option.some(refusal as never)',
      },
    ],
    tests,
  },
  {
    name: 'the message the Source gave is replaced by a generic one',
    edits: [
      {
        file: server,
        find: 'return yield* new RemoteMutationError({ message: refused.message, refusal: encoded })',
        replace: "return yield* new RemoteMutationError({ message: 'refused', refusal: encoded })",
      },
    ],
    tests,
  },
]
