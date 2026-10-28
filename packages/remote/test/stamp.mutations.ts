/**
 * An insert's stamps and a new row's derived members, predicted, broken in
 * turn: `pnpm mutate packages/remote/test/stamp.mutations.ts`.
 */
const tests = ['packages/remote/test/stamp.test.ts']
const file = '../src/mutation.ts'
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'an insert shows none of its stamped fields',
    '    values: { ...bound.values, ...stamps.values },',
    '    values: bound.values,',
  ),
  edit(
    'an insert points none of its stamped links',
    '    links: { ...bound.links, ...stamps.links },',
    '    links: bound.links,',
  ),
  edit(
    'the derived members do not see a stamped link',
    "const bound = stampedBound(write, input, write._tag === 'Update' ? keys : undefined, stamping)",
    "const bound = DomainWrite.bind(write, input as never, write._tag === 'Update' ? keys : undefined)",
  ),
  edit(
    'the clock stamp is predicted from nothing',
    'const stamping = { viewer: context.viewer, now: context.now }',
    'const stamping = { viewer: context.viewer, now: Option.none() }',
  ),
  edit(
    'the clock stamp is predicted as 0 when no time is given',
    'const stamping = { viewer: context.viewer, now: context.now }',
    'const stamping = { viewer: context.viewer, now: Option.some(Option.getOrElse(context.now, () => 0)) }',
  ),
  edit('a new row is counted as liked once', 'Count: () => 0,', 'Count: () => 1,'),
  edit("a new row's exists is not predicted", 'Exists: () => null })', "Exists: () => 'l0' })"),
  edit(
    'a new row shows no derived members',
    '        Insert: () => freshDerived(write, input, context.derived),',
    '        Insert: () => [],',
  ),
  edit(
    'the viewer is not passed to the stamps',
    'const stamping = { viewer: context.viewer, now: context.now }',
    'const stamping = { viewer: Option.none(), now: context.now }',
  ),
  {
    name: 'a pending create joins no list',
    edits: [
      {
        file: '../src/index.ts',
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
        find: '                  now: Option.fromUndefinedOr(options.now),',
        replace: '                  now: Option.none(),',
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
