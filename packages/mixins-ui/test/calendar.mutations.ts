/**
 * The calendar recipe, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/calendar.mutations.ts`.
 */
const browser = ['packages/mixins-ui/test/calendar.browser.test.ts']
const recipe = '../src/recipes/calendar.ts'

export default [
  {
    name: 'a md day is off the ladder',
    edits: [
      {
        file: recipe,
        find: "'--_fk-calendar-cell': '2.25rem'",
        replace: "'--_fk-calendar-cell': '2rem'",
      },
    ],
    tests: browser,
  },
  {
    name: 'the chosen day does not fill',
    edits: [
      {
        file: recipe,
        find: "    Style.nest('[data-selected] > &, [data-selected] > &:hover', {\n      background: ref.accent.default,\n",
        replace: "    Style.nest('[data-selected] > &, [data-selected] > &:hover', {\n",
      },
    ],
    tests: browser,
  },
  {
    name: 'a day outside the month looks like one in it',
    edits: [
      {
        file: recipe,
        find: "    Style.nest('[data-outside-month] > &', { color: ref.text.muted }),\n",
        replace: '',
      },
    ],
    tests: browser,
  },
]
