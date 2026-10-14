/**
 * The dialog and slider recipes' layout, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/layout.mutations.ts`.
 */
export default [
  {
    name: 'the open dialog leaves its panel at the top',
    edits: [
      {
        file: '../src/recipes/dialog.ts',
        find: "      Style.nest('&[open]', { display: 'grid', placeItems: 'center' }),\n",
        replace: '',
      },
    ],
    tests: ['packages/mixins-ui/test/dialog.browser.test.ts'],
  },
  {
    name: 'a centered slider shrinks to its label',
    edits: [
      {
        file: '../src/recipes/slider.ts',
        find: ", minInlineSize: '12rem' }",
        replace: ' }',
      },
    ],
    tests: ['packages/mixins-ui/test/slider.browser.test.ts'],
  },
]
