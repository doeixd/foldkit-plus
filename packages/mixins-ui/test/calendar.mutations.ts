/**
 * The calendar recipe, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/calendar.mutations.ts`.
 */
const browser = ['packages/mixins-ui/test/calendar.browser.test.ts']
const unit = ['packages/mixins-ui/test/calendar.test.ts']
const recipe = '../src/recipes/calendar.ts'
const adapter = '../src/calendar.ts'

export default [
  {
    name: 'a md day is off the ladder',
    edits: [
      {
        file: recipe,
        find: "const cell = ladder('height')",
        replace: "const cell = '2rem'",
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
  {
    name: 'a range draws no band',
    edits: [
      {
        file: recipe,
        find: "    zIndex: '-1',\n    background: ref.accent.subtle,\n",
        replace: "    zIndex: '-1',\n",
      },
    ],
    tests: browser,
  },
  {
    name: 'the band breaks between days',
    edits: [
      {
        file: recipe,
        find: "const week = component(Style.self({ display: 'grid', gridTemplateColumns: `repeat(7, ${cell})` }))",
        replace:
          "const week = component(Style.self({ display: 'grid', gridTemplateColumns: `repeat(7, ${cell})`, gap: '4px' }))",
      },
    ],
    tests: browser,
  },
  {
    name: 'the header is drawn outside its slot',
    edits: [
      {
        file: adapter,
        find: '  const header = builders.header.attrs()',
        replace: '  const header = builders.root.attrs()',
      },
    ],
    tests: unit,
  },
  {
    name: 'the months show no months',
    edits: [
      {
        file: adapter,
        find: 'h.div(cell.cellAttributes, [h.button(cell.buttonAttributes, [cell.shortLabel])]),',
        replace: 'h.div(cell.cellAttributes, []),',
      },
    ],
    tests: unit,
  },
  {
    name: 'the days draw no weeks',
    edits: [
      {
        file: adapter,
        find: '          ...days.weeks.map(week =>',
        replace: '          ...[].map(week =>',
      },
    ],
    tests: unit,
  },
]
