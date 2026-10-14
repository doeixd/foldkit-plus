/**
 * The table and code toolbars, each broken in turn: `pnpm mutate
 * packages/mixins-richtext/test/table.mutations.ts` checks that a test fails for every one.
 */
const tests = ['packages/mixins-richtext/test/table.test.ts']

export default [
  {
    name: 'the header button sets what is already there',
    edits: [
      {
        file: '../src/table.ts',
        find: 'props: { header: !header } }',
        replace: 'props: { header } }',
      },
    ],
    tests,
  },
  {
    name: 'the buttons work outside a table',
    edits: [
      {
        file: '../src/table.ts',
        find: 'h.Disabled(at === undefined || message === undefined),',
        replace: 'h.Disabled(message === undefined),',
      },
    ],
    tests,
  },
  {
    name: 'a language the list lacks is not offered',
    edits: [
      {
        file: '../src/code.ts',
        find: '      : [...input.languages, { id: language, label: language }]',
        replace: '      : input.languages',
      },
    ],
    tests,
  },
  {
    name: 'Copy sends nothing',
    edits: [
      {
        file: '../src/code.ts',
        find: "          h.DataAttribute('code', 'copy'),\n          h.OnClick(input.copied),",
        replace: "          h.DataAttribute('code', 'copy'),",
      },
    ],
    tests,
  },
]
