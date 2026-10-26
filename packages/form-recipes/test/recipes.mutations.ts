/**
 * The date and time recipes, broken in turn: `pnpm mutate packages/form-recipes/test/recipes.mutations.ts`.
 */
const index = '../src/index.ts'
const wall = '../src/wall.ts'
const date = ['packages/form-recipes/test/date.test.ts']
const text = ['packages/form-recipes/test/text.test.ts']
const html = '../src/html.ts'
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
  {
    name: 'an email address is any text',
    edits: [{ file: index, find: 'address.test(draft) ? draft : undefined', replace: 'draft' }],
    tests: text,
  },
  {
    name: 'a web address may have any scheme',
    edits: [
      {
        file: index,
        find: "(data.protocols ?? ['https:', 'http:']).includes(new URL(draft).protocol)",
        replace: 'true',
      },
    ],
    tests: text,
  },
  {
    name: 'a web address may run script by default',
    edits: [
      { file: index, find: "['https:', 'http:']", replace: "['https:', 'http:', 'javascript:']" },
    ],
    tests: text,
  },
  {
    name: 'a password shows in a list',
    edits: [{ file: index, find: 'display: Display.hidden(),', replace: 'display: text,' }],
    tests: text,
  },
  {
    name: 'a slug follows its key unchanged',
    edits: [
      {
        file: index,
        find: 'options.through ?? slugify',
        replace: 'options.through ?? ((t: string) => t)',
      },
    ],
    tests: text,
  },
  {
    name: 'a keyboard capitalizes an address',
    edits: [{ file: html, find: "  h.Attribute('autocapitalize', 'none'),\n", replace: '' }],
    tests: text,
  },
  {
    name: 'a new password is filled as the current one',
    edits: [{ file: html, find: "purpose === 'new'", replace: "purpose === 'current'" }],
    tests: text,
  },
  {
    name: 'a telephone number gets the letters keyboard',
    edits: [{ file: html, find: "context.h.InputMode('tel'),", replace: '' }],
    tests: text,
  },
  {
    name: 'a slug is drawn without its address',
    edits: [{ file: html, find: '[dataOf(Kinds.Slug, context.control).prefix]', replace: '[]' }],
    tests: text,
  },
  {
    name: 'the UI renderers keep the plain Slot',
    edits: [
      {
        file: '../src/ui.ts',
        find: 'text: builders(InputSlots, styles.input, context).input,',
        replace: 'text: context.slots.text,',
      },
    ],
    tests: ['packages/form-recipes/test/ui.test.ts'],
  },
]
