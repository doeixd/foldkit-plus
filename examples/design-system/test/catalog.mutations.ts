/**
 * The catalog additions' update and filter, broken in turn:
 * `pnpm mutate examples/design-system/test/catalog.mutations.ts`.
 */
const unit = ['examples/design-system/test/sections.test.ts']

export default [
  {
    name: 'the notification search ignores case',
    edits: [
      {
        file: '../src/sections/collections.ts',
        find: '.includes(query.trim().toLowerCase()),',
        replace: '.includes(query.trim()),',
      },
    ],
    tests: unit,
  },
  {
    name: 'the notification search keeps the spaces around the query',
    edits: [
      {
        file: '../src/sections/collections.ts',
        find: '.includes(query.trim().toLowerCase()),',
        replace: '.includes(query.toLowerCase()),',
      },
    ],
    tests: unit,
  },
  {
    name: 'clearing the search gives focus back to nothing',
    edits: [
      {
        file: '../src/sections/collections.ts',
        find: "      commands: Command.mapMessages([SearchField.Focus({ id: 'notice-search' })], message =>",
        replace: '      commands: Command.mapMessages([], message =>',
      },
    ],
    tests: unit,
  },
  {
    name: 'a repeated search returns a new Model',
    edits: [
      {
        file: '../src/sections/collections.ts',
        find: '      value === model.query ? { model } : { model: modifyFields(model, { query: () => value }) },',
        replace: '      ({ model: modifyFields(model, { query: () => value }) }),',
      },
    ],
    tests: unit,
  },
  {
    name: 'a menu pick is forgotten',
    edits: [
      {
        file: '../src/sections/overlays.ts',
        find: 'picked: current => (Option.isSome(picked) ? picked : current),',
        replace: 'picked: current => current,',
      },
    ],
    tests: ['examples/design-system/test/sections.test.ts'],
  },
]
