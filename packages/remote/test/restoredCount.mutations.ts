/**
 * A restored durable create counted once over a store that holds its row
 * (#410), broken in turn: `pnpm mutate packages/remote/test/restoredCount.mutations.ts`.
 */
const model = '../src/model.ts'
const tests = ['packages/remote/test/restoredCount.test.ts']

export default [
  {
    name: 'a restored create counts again over a store that holds its row',
    edits: [
      {
        file: model,
        find: '? uncounted(operation) : operation',
        replace: '? operation : operation',
      },
    ],
    tests,
  },
  {
    name: 'a create is counted over any store',
    edits: [
      {
        file: model,
        find: 'createdIn(released.entities, operation) && countedIn(released.entities, operation, at)',
        replace: 'Option.isSome(createdBy(operation))',
      },
    ],
    tests,
  },
  {
    name: 'a count read before the create takes no increment',
    edits: [
      {
        file: model,
        find: 'countedIn(released.entities, operation, at)',
        replace: 'true',
      },
    ],
    tests,
  },
  {
    name: 'a deleted row counts as held',
    edits: [
      { file: model, find: 'store[key]?.tombstone === false', replace: 'store[key] !== undefined' },
    ],
    tests,
  },
  {
    name: 'a count move names no create',
    edits: [
      {
        file: '../src/mutation.ts',
        find: "Match.when('Insert', () =>\n                Object.keys(moved).length > 0",
        replace: "Match.when('Insert', () =>\n                false",
      },
    ],
    tests,
  },
  {
    name: 'the outbox stores no create',
    edits: [
      {
        file: '../src/outboxStore.ts',
        find: '    creates: Schema.optionalKey(Ref),\n',
        replace: '',
      },
    ],
    tests,
  },
]
