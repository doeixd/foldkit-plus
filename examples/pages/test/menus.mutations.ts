/**
 * The menus around the editor, each broken in turn: `pnpm mutate
 * examples/pages/test/menus.mutations.ts`.
 */
const file = '../src/app.ts'
const tests = ['examples/pages/test/pages.test.ts']

export default [
  {
    name: 'the editor never hears that Escape closed a query',
    edits: [
      {
        file,
        find: 'slashDismissed: model.slashDismissed,',
        replace: 'slashDismissed: Option.none(),',
      },
    ],
    tests,
  },
  {
    name: 'a dismissal the editor made is not kept',
    edits: [
      {
        file,
        find: '          slashDismissed: () => result.model.slashDismissed,\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the arrows move nothing',
    edits: [
      {
        file,
        find: ': { model: modifyFields(model, { menuIndex: () => index }) },',
        replace: ': { model },',
      },
    ],
    tests,
  },
  {
    name: 'a handle edits wherever the caret already is',
    edits: [
      {
        file,
        find: 'editing(menuClosed(model), [EditorMessage.Selected({ selection: caret }), message])',
        replace: 'editing(menuClosed(model), [message])',
      },
    ],
    tests,
  },
  {
    name: 'a handle edit leaves its menu open',
    edits: [
      {
        file,
        find: '    ? { model: menuClosed(model) }\n    : editing(menuClosed(model), [Editor',
        replace: '    ? { model: menuClosed(model) }\n    : editing(model, [Editor',
      },
    ],
    tests,
  },
  {
    name: 'a hover names the block again and again',
    edits: [
      {
        file,
        find: 'Option.getOrUndefined(model.hovered) === node',
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'opening a page keeps the last one’s menu',
    edits: [{ file, find: '    menu: () => Option.none(),\n    hovered', replace: '    hovered' }],
    tests,
  },
]
