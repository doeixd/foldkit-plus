/**
 * The date and time recipes, broken in turn: `pnpm mutate packages/form-recipes/test/recipes.mutations.ts`.
 */
const index = '../src/index.ts'
const wall = '../src/wall.ts'
const date = ['packages/form-recipes/test/date.test.ts']
const dateTime = ['packages/form-recipes/test/dateTime.test.ts']

export default [
  {
    name: 'a date is shown as String(value)',
    edits: [
      {
        file: index,
        find: 'if (isCalendarDate(value)) return writeDate(value)',
        replace: 'return String(value)',
      },
    ],
    tests: date,
  },
  {
    name: 'a date is read month-first',
    edits: [
      {
        file: index,
        find: 'month: Number(parts[2]), day: Number(parts[3])',
        replace: 'month: Number(parts[3]), day: Number(parts[2])',
      },
    ],
    tests: date,
  },
  {
    name: 'a date reads in English whatever its locale',
    edits: [
      {
        file: index,
        find: "new Intl.DateTimeFormat(data.locale ?? 'en', {",
        replace: "new Intl.DateTimeFormat('en', {",
      },
    ],
    tests: date,
  },
  {
    name: 'an instant is kept as local text',
    edits: [
      {
        file: index,
        find: 'instant: ({ zone }) => instant(zone),',
        replace: 'instant: () => local,',
      },
    ],
    tests: dateTime,
  },
  {
    name: 'local text is written again rather than kept as typed',
    edits: [
      {
        file: index,
        find: 'Option.as(readWall(draft), draft)',
        replace: 'Option.map(readWall(draft), writeWall)',
      },
    ],
    tests: dateTime,
  },
  {
    name: 'local text in an instant key is shown as the runtime reads it',
    edits: [
      {
        file: index,
        find: "typeof value === 'string' && instantText.test(value) ? Date.parse(value) : Number.NaN",
        replace: "typeof value === 'string' ? Date.parse(value) : Number.NaN",
      },
    ],
    tests: dateTime,
  },
  {
    name: 'an unknown zone is taken',
    edits: [
      {
        file: index,
        find: "if (options.stored === 'instant') knownZone(options.zone, 'FieldRecipes.dateTime')",
        replace: '',
      },
    ],
    tests: dateTime,
  },
  {
    name: 'a repeated time reads as the later',
    edits: [{ file: wall, find: 'Math.min(...instants)', replace: 'Math.max(...instants)' }],
    tests: dateTime,
  },
  {
    name: 'a skipped time is taken',
    edits: [
      {
        file: wall,
        find: '.filter(instant => asUtc(wallOf(instant, zone)) === local)',
        replace: '',
      },
    ],
    tests: dateTime,
  },
  {
    name: 'seconds are dropped from what is shown',
    edits: [{ file: wall, find: 'wall.second === 0 && wall.millisecond === 0', replace: 'true' }],
    tests: dateTime,
  },
  {
    name: 'an hour past the last is a time',
    edits: [{ file: wall, find: 'wall.hour < 24 &&', replace: '' }],
    tests: dateTime,
  },
  {
    name: 'a moment is drawn as a text input',
    edits: [
      { file: '../src/html.ts', find: "native('datetime-local')", replace: "native('text')" },
    ],
    tests: ['packages/form-recipes/test/html.test.ts'],
  },
]
