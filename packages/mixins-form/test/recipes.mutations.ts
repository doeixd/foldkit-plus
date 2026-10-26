/**
 * The shipped looks, broken in turn: `pnpm mutate packages/mixins-form/test/recipes.mutations.ts`.
 */
const file = '../src/recipes.ts'
const tests = ['packages/mixins-form/test/recipes.browser.test.ts']

export default [
  {
    name: 'a checkbox is the browser’s own size',
    edits: [
      {
        file,
        find: "    inlineSize: '1rem',\n    blockSize: '1rem',\n    margin: '0',",
        replace: "    margin: '0',",
      },
    ],
    tests,
  },
  {
    name: 'a failure reads as a description does',
    edits: [{ file, find: 'error: said(ref.error.ink),', replace: 'error: said(ref.text.muted),' }],
    tests,
  },
  {
    name: 'a text field is the browser’s own',
    edits: [{ file, find: '    text: input,', replace: '    text: Style.empty,' }],
    tests,
  },
  {
    name: 'a choice of many is as tall as its words',
    edits: [{ file, find: "minBlockSize: '1.5rem',", replace: '' }],
    tests,
  },
  {
    name: 'the submit stretches across the form',
    edits: [
      {
        file,
        find: "submit: component(button({}), Style.self({ justifySelf: 'start' })),",
        replace: 'submit: component(button({})),',
      },
    ],
    tests,
  },
]
