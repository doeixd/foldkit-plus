/**
 * The layers' rows speak the Builder's own Messages (#495), and `update`
 * applies them through the tree's helpers:
 * `pnpm mutate packages/builder/test/rows.mutations.ts`.
 */
const builder = '../src/index.ts'
const tests = ['packages/builder/test/builder.test.ts']

export default [
  {
    name: 'a pressed row is not made current',
    edits: [
      {
        file: builder,
        find: 'return LayersPlaced.helpers.focus(message.id)(model)',
        replace: 'return { model }',
      },
    ],
    tests,
  },
  {
    name: 'a pressed row does not select its node',
    edits: [
      {
        file: builder,
        find: "Match.tag('RowPressed', ({ id }) => Option.some<string>(id)),",
        replace: "Match.tag('RowPressed', () => Option.none()),",
      },
    ],
    tests,
  },
  {
    name: 'an expander only opens',
    edits: [
      {
        file: builder,
        find: 'return LayersPlaced.helpers.toggle(message.id)(model)',
        replace: 'return LayersPlaced.helpers.open(message.id)(model)',
      },
    ],
    tests,
  },
]
