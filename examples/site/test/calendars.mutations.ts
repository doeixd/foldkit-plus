/**
 * The Calendar page's further examples, broken in turn:
 * `pnpm mutate examples/site/test/calendars.mutations.ts`.
 */
const tests = ['examples/site/test/calendars.test.ts']
const file = '../src/gallery/calendars.ts'

export default [
  {
    name: 'a day keeps a time it has taken',
    edits: [
      {
        file,
        find: 'onSome: date => Option.filter(time, chosen => !takenOn(date).includes(chosen)),',
        replace: 'onSome: () => time,',
      },
    ],
    tests,
  },
  {
    name: 'a day drops a time it has free',
    edits: [
      {
        file,
        find: 'onSome: date => Option.filter(time, chosen => !takenOn(date).includes(chosen)),',
        replace: 'onSome: () => Option.none(),',
      },
    ],
    tests,
  },
  {
    name: 'Today chooses today but stays on the month shown',
    edits: [
      { file, find: 'calendar: UiCalendar.focusDate(calendar, TODAY),', replace: 'calendar,' },
    ],
    tests,
  },
  {
    name: 'previewing the same day makes a new Model',
    edits: [
      { file, find: '      samePreview(model.prices.preview, date)\n', replace: '      false\n' },
    ],
    tests,
  },
]
