/**
 * The palette example, broken in turn:
 * `pnpm mutate examples/widgets/test/palette.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['examples/widgets/test/palette.test.ts']
const browser = ['examples/widgets/test/palette.browser.test.ts']

export default [
  {
    name: 'every pick runs, chosen or not',
    edits: [
      {
        file: '../src/palette/app.ts',
        find: 'if (Option.isSome(previous) && previous.value === id) return { model: next }\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'running leaves the palette open',
    edits: [
      {
        file: '../src/palette/app.ts',
        find: "return { model: { ...next, open: false, query: '', lastRan: Option.some(label) } }",
        replace:
          "return { model: { ...next, open: true, query: '', lastRan: Option.some(label) } }",
      },
    ],
    tests,
  },
  {
    name: 'the panel never claims the dialog',
    edits: [
      {
        file: '../src/palette/view.ts',
        find: "h.Role('dialog'),",
        replace: "h.Role('group'),",
      },
    ],
    tests,
  },
  {
    name: 'Enter picks nothing',
    edits: [
      {
        file: '../src/palette/app.ts',
        find: 'Committed: ({ id }) => SelPlaced.helpers.activate(id)(model),',
        replace: 'Committed: () => ({ model }),',
      },
    ],
    tests,
  },
  {
    name: 'Enter runs nothing',
    edits: [
      {
        file: '../src/palette/app.ts',
        find: "Match.tag('Committed', ({ id }) => Option.some(id)),",
        replace: "Match.tag('Committed', () => Option.none()),",
      },
    ],
    tests,
  },
  {
    name: 'the island leaves out the DismissLayer subscription, so neither the backdrop nor Escape closes it',
    edits: [
      {
        file: '../src/palette/island.ts',
        find: 'subscriptions: Palette.subscriptions,',
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a row under the pointer does not become the active row',
    edits: [
      {
        file: '../src/palette/view.ts',
        find: 'Nav.wrapper.make(ListNavigation.Message.Focused({ id: command.id })),',
        replace: "Nav.wrapper.make(ListNavigation.Message.Focused({ id: 'none' })),",
      },
    ],
    tests: browser,
  },
  {
    name: 'the active row has no fill of its own',
    edits: [
      {
        file: '../src/style.ts',
        find: "const active = Style.pseudo('[data-active]', { background: wash })",
        replace: "const active = Style.pseudo('[data-active]', {})",
      },
    ],
    tests: browser,
  },
]
