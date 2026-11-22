/** The durable wiring and the list rename: `pnpm mutate examples/todo-app/test/durable.mutations.ts` */
const durable = ['examples/todo-app/test/durable.test.ts']
const runtime = ['examples/todo-app/test/runtime.test.ts']

export default [
  {
    name: 'the application stops declaring its durable transitions from the machine',
    edits: [
      {
        file: '../src/sync.ts',
        find: 'transitions: fromMachine(',
        replace: 'transitionsX: fromMachine(',
      },
    ],
    tests: durable,
  },
  {
    name: 'a durable tag is left out of the machine’s transitions',
    edits: [
      {
        file: '../src/sync.ts',
        find: "      'ClearedCompleted',\n      'RenamedList',",
        replace: "      'RenamedList',",
      },
    ],
    tests: durable,
  },
  {
    name: 'a declared transition gives the mount no live Model',
    edits: [
      {
        file: '../../../packages/sync/src/machine.ts',
        find: 'return Option.some(after === before ? model : projection.set(model, after))',
        replace: 'return Option.none()',
      },
    ],
    tests: durable,
  },
  {
    name: 'a blank list title becomes a durable rename',
    edits: [
      {
        file: '../src/machine.ts',
        find: '    input: Message.ListRenameRequested,\n    when: ({ input }) => filled(input.title),',
        replace: '    input: Message.ListRenameRequested,',
      },
    ],
    tests: [...durable, ...runtime],
  },
  {
    name: 'the list title input sends the durable rename itself',
    edits: [
      {
        file: '../src/view.ts',
        find: 'Message.ListRenameRequested({ title })',
        replace: 'Message.RenamedList({ title })',
      },
    ],
    tests: runtime,
  },
]
