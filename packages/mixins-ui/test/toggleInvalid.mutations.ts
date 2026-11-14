/**
 * The invalid look of Checkbox, Switch and RadioGroup, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/toggleInvalid.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/toggleInvalid.browser.test.ts']

export default [
  {
    name: 'an invalid checkbox shows no error edge',
    edits: [
      {
        file: '../src/recipes/toggle.ts',
        find: 'Style.pseudo(\'[aria-invalid="true"]\', { borderColor: ref.error.outline }),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an invalid checkbox shows the error edge only when unchecked',
    edits: [
      {
        file: '../src/recipes/toggle.ts',
        find: 'Style.pseudo(\'[aria-invalid="true"]\', { borderColor: ref.error.outline }),',
        replace:
          'Style.pseudo(\'[aria-invalid="true"]:not([aria-checked="true"])\', { borderColor: ref.error.outline }),',
      },
    ],
    tests,
  },
  {
    name: 'an invalid switch is not ringed',
    edits: [
      {
        file: '../src/recipes/toggle.ts',
        find: 'boxShadow: `0 0 0 ${ref.border.thin} ${ref.error.outline}`,',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an invalid group leaves its radios plain',
    edits: [
      {
        file: '../src/recipes/radio.ts',
        find: 'Style.nest(\'[aria-invalid="true"] &\', { borderColor: ref.error.outline }),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a valid checkbox shows the error edge',
    edits: [
      {
        file: '../src/recipes/toggle.ts',
        find: 'Style.pseudo(\'[aria-invalid="true"]\', { borderColor: ref.error.outline }),',
        replace: "Style.pseudo('', { borderColor: ref.error.outline }),",
      },
    ],
    tests,
  },
]
