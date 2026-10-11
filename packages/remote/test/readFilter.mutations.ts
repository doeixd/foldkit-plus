/**
 * A change to what a server's read rule reads, fetched rather than placed,
 * broken in turn: `pnpm mutate packages/remote/test/readFilter.mutations.ts`.
 */
const tests = ['packages/remote/test/readFilter.test.ts']

export default [
  {
    name: 'a row the list does not hold is placed though a rule reads the change',
    edits: [
      {
        file: '../src/impact.ts',
        find: 'if (!held && ruled !== undefined) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'a held row is fetched for a change a rule reads',
    edits: [
      {
        file: '../src/impact.ts',
        find: 'if (!held && ruled !== undefined) {',
        replace: 'if (ruled !== undefined) {',
      },
    ],
    tests,
  },
  {
    name: 'the domain gathers no read filter',
    edits: [
      {
        file: '../src/index.ts',
        find: 'DomainEntity.is(entity) ? [[entity.name, ReadFilter.members(entity.metadata)]] : [],',
        replace: '[],',
      },
    ],
    tests,
  },
  {
    name: 'a list is given no read filter',
    edits: [
      {
        file: '../src/index.ts',
        find: '(over === undefined ? undefined : definition.registry.filtered.get(over)) ?? []',
        replace: '[]',
      },
    ],
    tests,
  },
]
