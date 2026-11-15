/**
 * The trash notice, where focus goes after a page is made, entered or deleted, and the handle
 * following the caret, broken in turn: `pnpm mutate examples/pages/test/trashNotice.mutations.ts`.
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
  {
    name: 'a caret moved by the keys leaves the handle where the pointer was',
    edits: [
      {
        file,
        find: 'undoGroup: moved ? Option.none() : model.undoGroup,',
        replace: 'undoGroup: moved ? Option.none() : model.undoGroup, hovered: model.hovered,',
      },
    ],
    tests,
  },
  {
    name: 'a control focused leaves the tab stop where it was',
    edits: [
      {
        file,
        find: ': { model: modifyFields(model, { tabStop: () => Option.some(id) }) },',
        replace: ': { model },',
      },
    ],
    tests,
  },
  {
    name: 'the tab stop is rewritten when it is the same control',
    edits: [{ file, find: 'Option.contains(model.tabStop, id)', replace: 'false' }],
    tests,
  },
]
