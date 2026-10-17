/**
 * The design system's styles, broken in turn:
 * `pnpm mutate examples/design-system/test/style.mutations.ts`.
 */
export default [
  {
    name: 'the plan picker is only as wide as its plans',
    edits: [
      {
        file: '../src/style.ts',
        find: "Recipes.Segmented({ tray: 'tray', size: 'sm', width: 'fill' }),",
        replace: "Recipes.Segmented({ tray: 'tray', size: 'sm' }),",
      },
    ],
    tests: ['examples/design-system/test/components.browser.test.ts'],
  },
]
