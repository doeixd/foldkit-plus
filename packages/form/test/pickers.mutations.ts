/**
 * A form's `AskedForMore` names its relation pickers alone (#492), broken:
 * `pnpm mutate packages/form/test/pickers.mutations.ts`. The type half is a
 * `@ts-expect-error` in the same test, and in mixins-form's view tests.
 */
export default [
  {
    name: 'any key may ask for more',
    edits: [
      {
        file: '../src/index.ts',
        find: 'AskedForMore: { key: PickerKeySchema },',
        replace: 'AskedForMore: { key: KeySchema },',
      },
    ],
    tests: ['packages/form/test/form.test.ts'],
  },
  {
    name: 'every key that is no Bundle control counts as a picker',
    edits: [
      {
        file: '../src/index.ts',
        find: "key => members[key]!._tag === 'RelationInput' && plans[key].bundled === undefined,",
        replace: 'key => plans[key].bundled === undefined,',
      },
    ],
    tests: ['packages/form/test/form.test.ts'],
  },
]
