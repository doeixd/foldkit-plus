const tests = ['packages/remote/test/storeRowPath.test.ts']

export default [
  {
    name: 'Can.withMachine ignores False machine verdict when Remote allows',
    edits: [
      {
        file: '../src/can.ts',
        find: '      True: () =>\n        Verdict.match(machineVerdict, {\n          True: () => Verdict.True(),\n          False: () => Verdict.False(Option.some(CanRefusal.Unmet({}))),\n          Unknown: ({ reason }) => undecided([reason]),\n        }),',
        replace: '      True: () => Verdict.True(),',
      },
    ],
    tests,
  },
  {
    name: 'storeRowPath omits entityKey segment',
    edits: [
      {
        file: '../src/storePath.ts',
        find: "  return Path.make<Model, Row>([...base, 'entities', entityKey(entityName, id), 'values'])",
        replace: "  return Path.make<Model, Row>([...base, 'entities', 'values'])",
      },
    ],
    tests,
  },
]
