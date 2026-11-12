/**
 * The checkbox Slot protects `data-grid-checkbox`:
 * `pnpm mutate packages/mixins-data-grid/test/checkboxProtection.mutations.ts`.
 */
export default [
  {
    name: 'the checkbox Slot leaves data-grid-checkbox to a Mixin',
    edits: [
      {
        file: '../src/slots.ts',
        find: 'Attr.AriaLabel, GridCheckbox]',
        replace: 'Attr.AriaLabel]',
      },
    ],
    tests: ['packages/mixins-data-grid/test/checkboxProtection.test.ts'],
  },
]
