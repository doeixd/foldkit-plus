/**
 * The chips' icons, broken: `pnpm mutate examples/design-system/test/icons.mutations.ts`
 * checks that a test fails.
 */
export default [
  {
    name: 'the chips show no icon',
    edits: [
      {
        file: '../src/style.ts',
        find: "Icons.byAttribute('data-icon', masks),",
        replace: "Icons.byAttribute('data-icon', {}),",
      },
    ],
    tests: ['examples/design-system/test/icons.test.ts'],
  },
]
