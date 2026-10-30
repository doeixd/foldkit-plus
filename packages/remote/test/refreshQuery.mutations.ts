/**
 * `Data.refresh` of a query ref, broken in turn:
 * `pnpm mutate packages/remote/test/refreshQuery.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/remote/test/refreshQuery.test.ts']

export default [
  {
    name: 'a ref is read as a record of entries',
    edits: [
      {
        file: '../src/index.ts',
        find: '    if (isQueryRef(target)) {',
        replace: '    if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'a record keyed identity is read as a ref',
    edits: [
      {
        file: '../src/index.ts',
        find: "typeof (target as Partial<Record<'identity', unknown>>).identity === 'string'",
        replace: "'identity' in target",
      },
    ],
    tests,
  },
  {
    name: 'a query the domain does not register is refreshed',
    edits: [
      {
        file: '../src/index.ts',
        find: "      assertRegistered(bound, 'Query', bound.definition.registry.queries, target.query)\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a try again asks again a list that loaded',
    edits: [
      {
        file: '../src/index.ts',
        find: '        failed || (options.failed !== true && remote.connections[target.identity] !== undefined)',
        replace: '        failed || remote.connections[target.identity] !== undefined',
      },
    ],
    tests,
  },
  {
    name: 'a failed list is not asked again',
    edits: [
      {
        file: '../src/index.ts',
        find: '        failed || (options.failed !== true && remote.connections[target.identity] !== undefined)',
        replace:
          '        options.failed !== true && remote.connections[target.identity] !== undefined',
      },
    ],
    tests,
  },
  {
    name: 'an unloaded list is marked',
    edits: [
      {
        file: '../src/index.ts',
        find: '        failed || (options.failed !== true && remote.connections[target.identity] !== undefined)',
        replace: '        failed || options.failed !== true',
      },
    ],
    tests,
  },
]
