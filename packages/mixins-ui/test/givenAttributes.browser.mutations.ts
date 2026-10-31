/**
 * The attributes given a popup's parts, wrapped a second time as #374 did:
 * `pnpm mutate packages/mixins-ui/test/givenAttributes.browser.mutations.ts`
 * checks that the test fails.
 */
const tests = ['packages/mixins-ui/test/givenAttributes.browser.test.ts']

const rewrapped = (file: string, name: string) => ({
  name: `${file} wraps the given ${name} again`,
  edits: [{ file: `../src/${file}`, find: `...${name},`, replace: `...childAttributes(${name}),` }],
  tests,
})

export default [
  rewrapped('listboxShared.ts', 'buttonAttributes'),
  rewrapped('listboxShared.ts', 'itemsAttributes'),
  rewrapped('comboboxShared.ts', 'inputAttributes'),
  rewrapped('comboboxShared.ts', 'itemsAttributes'),
  rewrapped('menuView.ts', 'buttonAttributes'),
  rewrapped('menuView.ts', 'itemsAttributes'),
]
