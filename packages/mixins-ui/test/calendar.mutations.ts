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
        find: 'const cell = controlHeight',
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
        find: "Style.pseudo('[data-in-range]::before', band(ref.accent.subtle)),",
        replace: "Style.pseudo('[data-in-range]::before', band('transparent')),",
      },
    ],
    tests: browser,
  },
  {
    name: 'the band breaks between days',
    edits: [
      {
        file: recipe,
        find: "maxInlineSize: '100%',",
        replace: "maxInlineSize: '100%', gap: '4px',",
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
  ...(
    [
      ['a range', 'Range: () => [h.AriaMultiSelectable(true)],', 'Range: () => [],'],
      ['many days', 'Multiple: () => [h.AriaMultiSelectable(true)],', 'Multiple: () => [],'],
      [
        'one day',
        'Single: () => [],\n            Range',
        'Single: () => [h.AriaMultiSelectable(true)],\n            Range',
      ],
    ] as const
  ).map(([holding, find, replace]) => ({
    name: `a grid holding ${holding} says the wrong thing of how many it holds`,
    edits: [{ file: '../src/calendar.ts', find, replace }],
    tests: ['packages/mixins-ui/test/calendarSelection.test.ts'],
  })),
  {
    name: 'upstream is given no day for a Single selection',
    edits: [
      {
        file: '../src/calendar.ts',
        find: 'maybeSelectedDate: selectedDate(selection),',
        replace: 'maybeSelectedDate: Option.none(),',
      },
    ],
    tests: ['packages/mixins-ui/test/calendarSelection.test.ts'],
  },
  {
    name: 'a week is numbered by its first day',
    edits: [{ file: adapter, find: 'Arr.get(week.cells, 3)', replace: 'Arr.get(week.cells, 0)' }],
    tests: ['packages/mixins-ui/test/calendarOptions.test.ts'],
  },
  {
    name: 'an ISO week is counted from the date, not its Thursday',
    edits: [
      {
        file: adapter,
        find: 'const thursday = new Date(at + (4 - weekday) * DAY)',
        replace: 'const thursday = new Date(at)',
      },
    ],
    tests: ['packages/mixins-ui/test/calendarOptions.test.ts'],
  },
  {
    name: 'a hidden paging button is drawn anyway',
    edits: [
      {
        file: adapter,
        find: "() => paging === 'both' || paging === 'previous',",
        replace: '() => true,',
      },
    ],
    tests: ['packages/mixins-ui/test/calendarOptions.test.ts'],
  },
  {
    name: 'a month outside the bounds is offered',
    edits: [
      {
        file: adapter,
        find: 'disabled: outside(model, firstOf(year, index + 1), lastOf(year, index + 1)),',
        replace: 'disabled: false,',
      },
    ],
    tests: ['packages/mixins-ui/test/calendarOptions.test.ts'],
  },
  {
    name: 'show drops the focused day for the first',
    edits: [
      {
        file: adapter,
        find: 'Math.min(focused.day, Dates.daysInMonth(year, month))',
        replace: '1',
      },
    ],
    tests: ['packages/mixins-ui/test/calendarOptions.test.ts'],
  },
  {
    name: 'show leaves the bounds',
    edits: [
      {
        file: adapter,
        find: 'onSome: min => Dates.max(wanted, min),',
        replace: 'onSome: () => wanted,',
      },
    ],
    tests: ['packages/mixins-ui/test/calendarOptions.test.ts'],
  },
  {
    name: 'show makes a new Model for the month shown',
    edits: [
      {
        file: adapter,
        find: 'if (year === model.viewYear && month === model.viewMonth) return model',
        replace: '',
      },
    ],
    tests: ['packages/mixins-ui/test/calendarOptions.test.ts'],
  },
  {
    name: 'a finished range still previews',
    edits: [
      {
        file: adapter,
        find: 'Option.filter(start, () => Option.isNone(end)),\n        from =>',
        replace: 'start,\n        from =>',
      },
    ],
    tests: ['packages/mixins-ui/test/calendarOptions.test.ts'],
  },
  {
    name: 'the grid never says the pointer left',
    edits: [
      {
        file: adapter,
        find: 'onSome: ({ onPreview }) => [h.OnMouseLeave(onPreview(Option.none()))],',
        replace: 'onSome: () => [],',
      },
    ],
    tests: [
      'packages/mixins-ui/test/calendarOptions.test.ts',
      'packages/mixins-ui/test/calendarLook.browser.test.ts',
    ],
  },
  {
    name: 'a disabled day previews',
    edits: [
      {
        file: adapter,
        find: 'Option.filter(listening, () => !cell.isDisabled),',
        replace: 'listening,',
      },
    ],
    tests: ['packages/mixins-ui/test/calendarOptions.test.ts'],
  },
  {
    name: 'lastDays counts one day more',
    edits: [
      {
        file: adapter,
        find: 'start: Option.some(Dates.subtractDays(today, Math.max(1, days) - 1)),',
        replace: 'start: Option.some(Dates.subtractDays(today, Math.max(1, days))),',
      },
    ],
    tests: ['packages/mixins-ui/test/calendarOptions.test.ts'],
  },
  {
    name: 'a preset is pressed whatever the selection',
    edits: [
      {
        file: adapter,
        find: 'h.AriaPressed(String(isSame(preset.selection, options.selection))),',
        replace: "h.AriaPressed('true'),",
      },
    ],
    tests: ['packages/mixins-ui/test/calendarOptions.test.ts'],
  },
  {
    name: 'a range of other days is the same',
    edits: [
      {
        file: adapter,
        find: "right._tag === 'Range' && sameDay(start, right.start) && sameDay(end, right.end),",
        replace: "right._tag === 'Range',",
      },
    ],
    tests: ['packages/mixins-ui/test/calendarOptions.test.ts'],
  },
  {
    name: 'other months’ days stay drawn when hidden',
    edits: [
      {
        file: recipe,
        find: "Style.pseudo('[data-outside-month]', { visibility: 'hidden' })",
        replace: "Style.pseudo('[data-outside-month]', {})",
      },
    ],
    tests: ['packages/mixins-ui/test/calendarLook.browser.test.ts'],
  },
  {
    name: 'the dropdowns crowd the arrows',
    edits: [
      {
        file: recipe,
        find: "Style.self({ ...select, marginInlineStart: 'auto' }),",
        replace: 'Style.self(select),',
      },
    ],
    tests: ['packages/mixins-ui/test/calendarLook.browser.test.ts'],
  },
  {
    name: 'today is not filled',
    edits: [
      {
        file: recipe,
        find: "Style.nest('[data-today] > &', {\n      background: ref.surface.muted,",
        replace: "Style.nest('[data-today] > &', {",
      },
    ],
    tests: ['packages/mixins-ui/test/calendarLook.browser.test.ts'],
  },
  {
    name: 'weekday names read as days do',
    edits: [{ file: recipe, find: '    columnHeader: component(Style.self(small)),', replace: '' }],
    tests: ['packages/mixins-ui/test/calendarLook.browser.test.ts'],
  },
  {
    name: 'a chosen day keeps the regular weight',
    edits: [
      {
        file: recipe,
        find: "      color: ref.accent['on-fill'],\n      fontWeight: ref.weight.medium,",
        replace: "      color: ref.accent['on-fill'],",
      },
    ],
    tests: ['packages/mixins-ui/test/calendarLook.browser.test.ts'],
  },
  {
    name: 'a preview draws no band',
    edits: [
      {
        file: recipe,
        find: '...band(`color-mix(in oklab, ${ref.accent.subtle} 50%, transparent)`),',
        replace: "...band('transparent'),",
      },
    ],
    tests: ['packages/mixins-ui/test/calendarLook.browser.test.ts'],
  },
  {
    name: 'the paging arrows flip right to left, undoing the bidi mirror',
    edits: [
      {
        file: recipe,
        find: '    previousMonthButton: quiet,',
        replace:
          "    previousMonthButton: component(quiet, Style.pseudo(':dir(rtl)', { scale: '-1 1' })),",
      },
    ],
    tests: ['packages/mixins-ui/test/calendarLook.browser.test.ts'],
  },
  {
    name: 'a week starts a day late',
    edits: [
      {
        file: adapter,
        find: 'dayNamesOrder[first % 7]',
        replace: 'dayNamesOrder[(first + 1) % 7]',
      },
    ],
    tests: ['packages/mixins-ui/test/calendarOptions.test.ts'],
  },
  {
    name: 'a long month is written as a number',
    edits: [
      {
        file: adapter,
        find: "options.month === 'long'",
        replace: "options.month === 'numeric'",
      },
    ],
    tests: ['packages/mixins-ui/test/calendarOptions.test.ts'],
  },
  {
    name: 'a narrow month spills its week',
    edits: [
      {
        file: recipe,
        find: 'gridAutoColumns: `minmax(0, ${cell})`,',
        replace: 'gridAutoColumns: cell,',
      },
    ],
    tests: ['packages/mixins-ui/test/calendarLook.browser.test.ts'],
  },
  {
    name: 'a shrunk round day turns oval',
    edits: [{ file: recipe, find: "aspectRatio: '1' }", replace: 'blockSize: cell }' }],
    tests: ['packages/mixins-ui/test/calendarLook.browser.test.ts'],
  },
  {
    name: 'every day is given a detail',
    edits: [
      {
        file: adapter,
        find: 'const detailOf = options.detail ?? (() => Option.none())',
        replace: "const detailOf = () => Option.some('detail')",
      },
    ],
    tests: ['packages/mixins-ui/test/calendarOptions.test.ts'],
  },
  {
    name: 'a detail is drawn outside its day’s button',
    edits: [
      {
        file: adapter,
        find: 'h.button(cell.buttonAttributes, [\n                    cell.label,\n',
        replace: 'h.button(cell.buttonAttributes, [cell.label]),\n                  h.span([], [\n',
      },
    ],
    tests: ['packages/mixins-ui/test/calendarOptions.test.ts'],
  },
  {
    name: 'a day with a detail is not described by it',
    edits: [{ file: adapter, find: ', context.h.AriaDescribedBy(id)]', replace: ']' }],
    tests: ['packages/mixins-ui/test/calendarOptions.test.ts'],
  },
  {
    name: 'a detail stands beside its number',
    edits: [
      {
        file: recipe,
        find: "            display: 'grid',\n            justifyItems: 'center',\n",
        replace: '',
      },
    ],
    tests: ['packages/mixins-ui/test/calendarLook.browser.test.ts'],
  },
  {
    name: 'a priced day keeps a round cell',
    edits: [{ file: recipe, find: 'blockSize: `calc(${cell} * 1.5)`,', replace: '' }],
    tests: ['packages/mixins-ui/test/calendarLook.browser.test.ts'],
  },
  {
    name: 'a dot shows its words',
    edits: [{ file: recipe, find: "            fontSize: '0',\n", replace: '' }],
    tests: ['packages/mixins-ui/test/calendarLook.browser.test.ts'],
  },
  {
    name: 'a dot sits off center',
    edits: [{ file: recipe, find: "            marginInline: 'auto',\n", replace: '' }],
    tests: ['packages/mixins-ui/test/calendarLook.browser.test.ts'],
  },
]
