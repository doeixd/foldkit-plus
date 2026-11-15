/**
 * The trash notice and where focus goes after a page is made, entered or deleted, broken in
 * turn: `pnpm mutate examples/pages/test/trashNotice.mutations.ts`.
 */
const file = '../src/app.ts'
const tests = ['examples/pages/test/pages.test.ts']

export default [
  {
    name: 'trashing a page offers no undo',
    edits: [
      {
        file,
        find: 'modifyFields(afresh(model, Option.none()), { justTrashed: () => Option.some(id) })',
        replace: 'afresh(model, Option.none())',
      },
    ],
    tests,
  },
  {
    name: 'the exchange that trashes the page clears its notice',
    edits: [
      {
        file,
        find: 'justTrashed: held => (Option.isSome(open) ? Option.none() : held)',
        replace: 'justTrashed: () => Option.none()',
      },
    ],
    tests,
  },
  {
    name: 'opening another page keeps the notice',
    edits: [
      {
        file,
        find: 'justTrashed: held => (Option.isSome(open) ? Option.none() : held)',
        replace: 'justTrashed: held => held',
      },
    ],
    tests,
  },
  {
    name: 'a new page does not focus its title',
    edits: [
      {
        file,
        find: "          FocusField({ selector: '#page-title' }),\n        ],\n      }\n    },",
        replace: '        ],\n      }\n    },',
      },
    ],
    tests,
  },
  {
    name: 'undo leaves the page closed',
    edits: [
      {
        file,
        find: 'model: afresh(model, Option.some(id)),',
        replace: 'model: afresh(model, Option.none()),',
      },
    ],
    tests,
  },
  {
    name: 'Enter in the title goes nowhere',
    edits: [
      {
        file,
        find: "commands: [FocusField({ selector: '#page-body [contenteditable]' })],",
        replace: 'commands: [],',
      },
    ],
    tests,
  },
]
