/**
 * The obligations `Patterns.Listbox` and `Patterns.Checkbox` name:
 * `pnpm mutate packages/mixins-ui/test/patternObligations.mutations.ts`.
 */
const unit = ['packages/mixins-ui/test/patternObligations.test.ts']

export default [
  {
    name: 'a checkbox owes no aria-checked',
    edits: [
      {
        file: '../src/patterns.ts',
        find: 'obligations: [A11y.Activation, A11y.FocusStrategy, A11y.State(Attr.AriaChecked), A11y.Name],',
        replace: 'obligations: [A11y.Activation, A11y.FocusStrategy, A11y.Name],',
      },
    ],
    tests: unit,
  },
  {
    name: 'a listbox owes no navigation',
    edits: [
      {
        file: '../src/patterns.ts',
        find: '    obligations: [A11y.Navigation, A11y.Name],',
        replace: '    obligations: [A11y.Name],',
      },
    ],
    tests: unit,
  },
  {
    name: 'an option owes no focus strategy',
    edits: [
      {
        file: '../src/patterns.ts',
        find: '    obligations: [A11y.FocusStrategy, A11y.Activation, A11y.State(Attr.AriaSelected)],',
        replace: '    obligations: [A11y.Activation, A11y.State(Attr.AriaSelected)],',
      },
    ],
    tests: unit,
  },
]
