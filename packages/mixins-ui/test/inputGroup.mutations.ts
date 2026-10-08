/**
 * `Recipes.InputGroup`, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/inputGroup.mutations.ts` checks that
 * a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/inputGroup.test.ts']

export default [
  {
    name: 'the group rings with the default outline',
    edits: [
      {
        file: '../src/recipes/field.ts',
        find: 'outline: `${ref.border.thick} solid ${ref.outline.focus}`',
        replace: 'outline: `${ref.border.thick} solid ${ref.outline.default}`',
      },
    ],
    tests,
  },
  {
    name: 'the control keeps its border',
    edits: [
      {
        file: '../src/recipes/field.ts',
        find: "      border: '0',\n      background: 'transparent',",
        replace: "      border: '1px solid red',\n      background: 'transparent',",
      },
    ],
    tests,
  },
]
