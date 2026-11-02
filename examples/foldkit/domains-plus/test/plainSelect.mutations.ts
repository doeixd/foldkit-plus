/**
 * The plain selects' options, branded in turn:
 * `pnpm mutate examples/foldkit/domains-plus/test/plainSelect.mutations.ts`.
 */
const tests = ['examples/foldkit/domains-plus/test/plainSelect.test.ts']

export default [
  {
    name: 'the options come from a returning function again, one identity each',
    edits: [
      {
        file: '../src/client/filters.ts',
        find: 'h.option([h.Value(value), h.Selected(value === config.value)], [config.labelOf(value)]),',
        replace:
          '(() => h.option([h.Value(value), h.Selected(value === config.value)], [config.labelOf(value)]))(),',
      },
    ],
    tests,
  },
]
