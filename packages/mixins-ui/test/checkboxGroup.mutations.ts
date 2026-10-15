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
