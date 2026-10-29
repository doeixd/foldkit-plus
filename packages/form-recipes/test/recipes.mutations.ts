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
        find: "dateFormat(data.locale ?? 'en', { dateStyle: 'medium', timeZone: 'UTC' })",
        replace: "dateFormat('en', { dateStyle: 'medium', timeZone: 'UTC' })",
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
    name: 'a stored instant is read as Date.parse reads it',
    edits: [
      {
        file: wall,
        find: 'const parts = isoInstant.exec(text)',
        replace:
          'if (!Number.isNaN(Date.parse(text))) return Option.some(Date.parse(text)); const parts = isoInstant.exec(text)',
      },
    ],
    tests: dateTime,
  },
  {
    name: 'an instant finer than a millisecond is cut to one',
    edits: [
      {
        file: wall,
        find: 'if (/[1-9]/.test(fraction.slice(3))) return Option.none()',
        replace: '',
      },
    ],
    tests: dateTime,
  },
  {
    name: 'an offset past 23:59 is taken',
    edits: [
      {
        file: wall,
        find: 'if (Number(hours) > 23 || Number(minutes) > 59) return Option.none()',
        replace: '',
      },
    ],
    tests: dateTime,
  },
  {
    name: 'the later of a repeated hour is shown without its offset',
    edits: [
      {
        file: wall,
        find: 'Option.contains(instantIn(reading, zone), instant)',
        replace: 'true',
      },
    ],
    tests: dateTime,
  },
  {
    name: 'a typed offset is taken whatever the zone’s clocks read',
    edits: [
      {
        file: wall,
        find: 'instant => utcOf(wallOf(instant, zone)) === utcOf(wall),',
        replace: '() => true,',
      },
    ],
    tests: dateTime,
  },
  {
    name: 'a draft that submits another instant is shown',
    edits: [
      {
        file: index,
        find: 'Option.contains(parse(draft), new Date(at).toISOString())',
        replace: 'true',
      },
    ],
    tests: dateTime,
  },
  {
    name: 'a list reads an instant as Date.parse does',
    edits: [
      {
        file: index,
        find: 'Option.match(readInstant(value), {',
        replace: 'Option.match(Option.liftPredicate(Date.parse(value), at => !Number.isNaN(at)), {',
      },
    ],
    tests: dateTime,
  },
  {
    name: 'the clocks’ era is ignored, so year 0 reads as year 1',
    edits: [
      {
        file: wall,
        find: "year: parts['era'] === 'BC' ? 1 - Number(parts['year']) : Number(parts['year']),",
        replace: "year: Number(parts['year']),",
      },
    ],
    tests: dateTime,
  },
  {
    name: 'the date-time input steps by a minute',
    edits: [{ file: html, find: "({ h }) => [h.Step('0.001')]", replace: '() => []' }],
    tests: [
      'packages/form-recipes/test/html.test.ts',
      'packages/form-recipes/test/dateTime.browser.test.ts',
    ],
  },
  {
    name: 'a draft of year 0 is drawn in a date-time input',
    edits: [{ file: html, find: 'wall => wall.year > 0', replace: '() => true' }],
    tests: ['packages/form-recipes/test/html.test.ts'],
  },
  {
    name: 'a draft with an offset is drawn in a date-time input',
    edits: [
      {
        file: html,
        find: "context.draft === '' || Option.exists(readWall(String(context.draft)), wall => wall.year > 0)",
        replace: 'true',
      },
    ],
    tests: ['packages/form-recipes/test/html.test.ts'],
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
        find: '.filter(instant => utcOf(wallOf(instant, zone)) === local)',
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
      { file: html, find: "native<Message>('datetime-local'", replace: "native<Message>('text'" },
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
  {
    name: 'a year under 100 is read as 19xx',
    edits: [
      {
        file: wall,
        find: 'at.setUTCFullYear(wall.year, wall.month - 1, wall.day)',
        replace: 'at.setTime(Date.UTC(wall.year, wall.month - 1, wall.day))',
      },
    ],
    tests: [...date, ...dateTime],
  },
  {
    name: 'a scheme is taken without its colon',
    edits: [
      { file: index, find: 'if (!/^[a-z][a-z0-9+.-]*:$/.test(protocol))', replace: 'if (false)' },
    ],
    tests: text,
  },
  {
    name: 'an address may hold an invisible character',
    edits: [
      {
        file: index,
        find: '/^[^\\s@\\p{C}]+@[^\\s@\\p{C}]+$/u',
        replace: '/^[^\\s@]+@[^\\s@]+$/u',
      },
    ],
    tests: text,
  },
  {
    name: 'slugify drops a dotless i',
    edits: [{ file: index, find: "  ı: 'i',\n", replace: '' }],
    tests: text,
  },
  {
    name: 'an instant past 9999 is taken',
    edits: [
      { file: index, find: 'at => new Date(at).getUTCFullYear() <= 9999)', replace: '() => true)' },
    ],
    tests: dateTime,
  },
  {
    name: 'slugify drops a Maltese h',
    edits: [{ file: index, find: "  ħ: 'h',\n", replace: '' }],
    tests: text,
  },
]
