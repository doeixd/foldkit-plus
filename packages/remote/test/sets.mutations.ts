/**
 * What the write's context sets and a new row's derived members, predicted,
 * broken in turn: `pnpm mutate packages/remote/test/sets.mutations.ts`.
 */
const tests = ['packages/remote/test/sets.test.ts']
const file = '../src/mutation.ts'
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a write shows none of the fields the context sets',
    '    values: { ...bound.values, ...set.values },',
    '    values: bound.values,',
  ),
  edit(
    'a write points none of the links the context sets',
    '    links: { ...bound.links, ...set.links },',
    '    links: bound.links,',
  ),
  edit(
    'an update predicts nothing the context sets',
    '        const bound = contextBound(write, input, keys, context, store)',
    '        const bound = DomainWrite.bind(write, input as never, keys)',
  ),
  edit(
    'the derived members do not see a link the context sets',
    '  const bound = contextBound(\n    write,',
    "  const bound = ((..._: unknown[]) => DomainWrite.bind(write, input as never, write._tag === 'Update' ? keys : undefined))(" +
      '\n    write,',
  ),
  edit(
    'the time is predicted from nothing',
    'const by: ExprContext = { viewer: context.viewer, now: context.now }',
    'const by: ExprContext = { viewer: context.viewer, now: Option.none() }',
  ),
  edit(
    'the time is predicted as 0 when none is given',
    'const by: ExprContext = { viewer: context.viewer, now: context.now }',
    'const by: ExprContext = { viewer: context.viewer, now: Option.some(Option.getOrElse(context.now, () => 0)) }',
  ),
  edit(
    'the viewer is not passed to the context',
    'const by: ExprContext = { viewer: context.viewer, now: context.now }',
    'const by: ExprContext = { viewer: Option.none(), now: context.now }',
  ),
  edit('a new row is counted as liked once', 'Count: () => 0,', 'Count: () => 1,'),
  edit("a new row's exists is not predicted", 'Exists: () => null })', "Exists: () => 'l0' })"),
  edit(
    'a new row shows no derived members',
    '        Insert: () => freshDerived(write, input, context.derived),',
    '        Insert: () => [],',
  ),
  {
    name: 'a pending create joins no list',
    edits: [
      {
        file: '../src/placing.ts',
        find: 'if (!holds.has(entityKey(change.entity, change.id)) && !created) continue',
        replace: 'if (!holds.has(entityKey(change.entity, change.id))) continue',
      },
    ],
    tests: [...tests, 'examples/chirp/test/post.test.ts'],
  },
  {
    name: 'Data.mutate predicts with no time',
    edits: [
      {
        file: '../src/index.ts',
        find: '              now: Option.fromUndefinedOr(options.now),',
        replace: '              now: Option.none(),',
      },
    ],
    tests: [...tests, 'examples/chirp/test/post.test.ts'],
  },
  {
    name: 'the request sends no time',
    edits: [
      { file: '../src/client.ts', find: '...(now === undefined ? {} : { now }),', replace: '' },
    ],
    tests: ['packages/remote/test/failedWrites.test.ts', 'examples/chirp/test/post.test.ts'],
  },
  {
    name: 'Data.mutate sends no time',
    edits: [
      {
        file: '../src/index.ts',
        find: '                now: options.now,',
        replace: '',
      },
    ],
    tests: ['packages/remote/test/failedWrites.test.ts', 'examples/chirp/test/post.test.ts'],
  },
  {
    name: 'the ledger keeps no time',
    edits: [
      {
        file: '../src/model.ts',
        find: 'now: Option.fromUndefinedOr(message.write.now),',
        replace: 'now: Option.none(),',
      },
    ],
    tests: ['packages/remote/test/failedWrites.test.ts'],
  },
  {
    name: 'a retry sends no time',
    edits: [
      {
        file: '../src/index.ts',
        find: 'now: Option.getOrUndefined(write.now),',
        replace: 'now: undefined,',
      },
    ],
    tests: ['packages/remote/test/failedWrites.test.ts'],
  },
  {
    name: 'the wire drops the time',
    edits: [{ file: '../src/wire.ts', find: 'now: Schema.optional(Schema.Int),', replace: '' }],
    tests: ['packages/remote/test/wire.test.ts', 'examples/chirp/test/post.test.ts'],
  },
  {
    name: 'Remote.now reads no clock',
    edits: [
      {
        file: '../src/index.ts',
        find: 'effect: Effect.map(Clock.currentTimeMillis, toMessage),',
        replace: 'effect: Effect.succeed(toMessage(0)),',
      },
    ],
    tests: ['examples/chirp/test/post.test.ts'],
  },
  {
    name: 'a trace answers at the real time',
    edits: [
      {
        file: '../src/testing.ts',
        find: '}).pipe(Effect.provideService(Clock.Clock, clock)),',
        replace: '}),',
      },
    ],
    tests: ['packages/remote/test/trace.test.ts'],
  },
  {
    name: "a trace's Commands read the real time",
    edits: [
      {
        file: '../src/testing.ts',
        find: 'Effect.provideService(Clock.Clock, clock),',
        replace: '',
      },
    ],
    tests: ['packages/remote/test/trace.test.ts', 'examples/chirp/test/post.test.ts'],
  },
]
