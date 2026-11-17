/**
 * The window list island in Chromium, broken in turn:
 * `pnpm mutate examples/widgets/test/window-list.browser.mutations.ts`.
 */
const view = '../src/window-list/view.ts'
const browser = ['examples/widgets/test/window-list.browser.test.ts']

export default [
  {
    name: 'a submit clears the row instead of going to it',
    edits: [
      {
        file: view,
        find: 'h.OnSubmit(Message.WentToRow())',
        replace: "h.OnSubmit(Message.ChangedRow({ text: '' }))",
      },
    ],
    tests: browser,
  },
  {
    name: 'the browser finds no text in rows that are not drawn',
    edits: [{ file: view, find: 'findable: name => name,', replace: '' }],
    tests: browser,
  },
  {
    name: 'a name holding focus is not held',
    edits: [
      { file: view, find: 'slots.name.attrs([h.Tabindex(-1)])', replace: 'slots.name.attrs()' },
    ],
    tests: browser,
  },
]
