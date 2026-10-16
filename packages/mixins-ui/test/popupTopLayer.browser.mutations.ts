/**
 * The popups' top-layer panels right to left, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/popupTopLayer.browser.mutations.ts`
 * checks that a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/popupTopLayer.browser.test.ts']

const keepsBrowserInset = (file: string) => ({
  file,
  find: "h.Style({ ...placed, inset: 'auto' }),",
  replace: 'h.Style(placed),',
})

export default [
  {
    name: "a menu's panel keeps the browser's inset",
    edits: [keepsBrowserInset('../src/menuView.ts')],
    tests,
  },
  {
    name: "a listbox's panel keeps the browser's inset",
    edits: [keepsBrowserInset('../src/listboxShared.ts')],
    tests,
  },
  {
    name: "a combobox's panel keeps the browser's inset",
    edits: [keepsBrowserInset('../src/comboboxShared.ts')],
    tests,
  },
]
