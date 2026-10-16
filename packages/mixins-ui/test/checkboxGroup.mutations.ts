/**
 * The checkbox group, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/checkboxGroup.mutations.ts`.
 */
const unit = ['packages/mixins-ui/test/checkboxGroup.test.ts']
const browser = ['packages/mixins-ui/test/checkboxGroup.browser.test.ts']
const view = '../src/checkboxGroup.ts'
const recipe = '../src/recipes/checkboxGroup.ts'

export default [
  {
    name: 'a label names nothing',
    edits: [
      {
        file: view,
        find: 'builders.label.attrs([h.For(checkboxId)])',
        replace: 'builders.label.attrs([])',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'a toggle keeps the option checked',
    edits: [
      {
        file: '../src/choices.ts',
        find: 'values.includes(value) ? values.filter(each => each !== value) : [...values, value]',
        replace: 'values.includes(value) ? values : [...values, value]',
      },
    ],
    tests: unit,
  },
  {
    name: 'a checked row in a list does not fill',
    edits: [
      {
        file: recipe,
        find: 'Style.pseudo(checked, { background: ref.accent.subtle }),',
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a vertical list leaves a gap between checked rows',
    edits: [{ file: recipe, find: "gap: '0'", replace: "gap: ladder('gap')" }],
    tests: browser,
  },
  {
    name: 'a horizontal group stacks its options',
    edits: [{ file: recipe, find: "flexDirection: 'row'", replace: "flexDirection: 'column'" }],
    tests: browser,
  },
  {
    name: 'a disabled option counts as a choice',
    edits: [
      {
        file: view,
        find: 'option.disabled === true ? [] : [option.value]',
        replace: '[option.value]',
      },
    ],
    tests: unit,
  },
  {
    name: 'every mix of checks is some',
    edits: [
      {
        file: view,
        find: "return on === values.length ? 'all' : 'some'",
        replace: "return 'some'",
      },
    ],
    tests: unit,
  },
  {
    name: 'an error is not announced',
    edits: [
      {
        file: view,
        find: 'invalid ? [h.AriaInvalid(true), h.AriaDescribedBy(errorId)] : []',
        replace: '[]',
      },
    ],
    tests: unit,
  },
  {
    name: 'checked rows together keep their corners',
    edits: [
      {
        file: recipe,
        find: 'Style.nest(`${checked} + &${checked}`, {',
        replace: 'Style.nest(`[data-never] + &${checked}`, {',
      },
    ],
    tests: browser,
  },
]
