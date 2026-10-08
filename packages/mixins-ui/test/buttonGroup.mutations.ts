/**
 * The button group, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/buttonGroup.mutations.ts` checks that
 * a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/buttonGroup.test.ts']

export default [
  {
    name: 'the group goes unnamed',
    edits: [
      {
        file: '../src/buttonGroup.ts',
        find: "builders.root.attrs([h.Role('group'), h.AriaLabel(options.label)]),",
        replace: "builders.root.attrs([h.Role('group')]),",
      },
    ],
    tests,
  },
  {
    name: 'borders double up between buttons',
    edits: [
      {
        file: '../src/recipes/buttonGroup.ts',
        find: "Style.nest('& > * + *', { marginInlineStart: overlap }),",
        replace: "Style.nest('& > * + *', { marginInlineStart: '0' }),",
      },
    ],
    tests,
  },
  {
    name: 'joining sides keep their radius',
    edits: [
      {
        file: '../src/recipes/buttonGroup.ts',
        find: "borderStartEndRadius: '0',",
        replace: "borderStartEndRadius: '4px',",
      },
    ],
    tests,
  },
]
