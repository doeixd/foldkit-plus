/**
 * `Data.refresh` over the active record, and a retried read keeping its
 * place, broken in turn:
 * `pnpm mutate packages/remote/test/refreshActive.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/remote/test/refreshActive.test.ts']

export default [
  {
    name: 'a retried field reads Initial until its read starts',
    edits: [
      {
        file: '../src/model.ts',
        find: '      const retried = reached.filter(mark => mark in model.failures.fields)',
        replace: '      const retried: ReadonlyArray<string> = []',
      },
    ],
    tests,
  },
  {
    name: 'a refresh marks loading what never failed',
    edits: [
      {
        file: '../src/model.ts',
        find: '      const retried = reached.filter(mark => mark in model.failures.fields)',
        replace: '      const retried = reached',
      },
    ],
    tests,
  },
  {
    name: 'a retried list reads Initial until its query starts',
    edits: [
      {
        file: '../src/model.ts',
        find: '      connection in model.failures.connections\n        ? new Set',
        replace: '      false\n        ? new Set',
      },
    ],
    tests,
  },
  {
    name: '`failed` asks again every read',
    edits: [
      {
        file: '../src/index.ts',
        find: '      options.failed === true\n        ? asking.filter(',
        replace: '      false\n        ? asking.filter(',
      },
    ],
    tests,
  },
  {
    name: '`failed` invalidates every list',
    edits: [
      {
        file: '../src/index.ts',
        find: '      options.failed === true\n        ? merged.filter(',
        replace: '      false\n        ? merged.filter(',
      },
    ],
    tests,
  },
  {
    name: 'one entry is read as a record',
    edits: [
      {
        file: '../src/index.ts',
        find: "    typeof members.projectionOf === 'function' ||\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a family is read as a record',
    edits: [
      {
        file: '../src/index.ts',
        find: "    typeof members.instancesOf === 'function' ||\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a Surface without params is read as a record',
    edits: [
      {
        file: '../src/index.ts',
        find: " ||\n    typeof members.projection === 'function'\n",
        replace: '\n',
      },
    ],
    tests: [...tests, 'packages/remote/test/domain.test.ts'],
  },
  {
    name: 'a record is read as one entry',
    edits: [
      {
        file: '../src/index.ts',
        find: "  typeof (target as Partial<Record<'read', unknown>>).read === 'function'",
        replace: "  'read' in target",
      },
    ],
    tests,
  },
  {
    name: 'a foreign Surface is refreshed',
    edits: [
      {
        file: '../src/index.ts',
        find: '  for (const entry of entries) assertOwnedBy(contract, entry)\n',
        replace: '',
      },
    ],
    tests,
  },
]
