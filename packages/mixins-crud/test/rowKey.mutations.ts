/**
 * A row's `data-row-key`, broken in turn:
 * `pnpm mutate packages/mixins-crud/test/rowKey.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/mixins-crud/test/rowKey.test.ts']
const source = '../src/index.ts'
const marked = "slots.row.attrs([h.Key(key), h.DataAttribute('row-key', key)]),"

export default [
  {
    name: 'a table row carries no key',
    edits: [
      {
        file: source,
        find: `${marked}\n                    columns`,
        replace: 'slots.row.attrs([h.Key(key)]),\n                    columns',
      },
    ],
    tests,
  },
  {
    name: 'a list row carries no key',
    edits: [
      {
        file: source,
        find: `${marked}\n                  input.onOpen`,
        replace: 'slots.row.attrs([h.Key(key)]),\n                  input.onOpen',
      },
    ],
    tests,
  },
]
