/**
 * The body's rich-text control and its toolbar, broken one guard at a time:
 * `pnpm mutate examples/cms/test/bodyEditor.mutations.ts`.
 */
const input = '../src/content/postForm.ts'
const unit = ['examples/cms/test/markdownInput.test.ts']
const browser = ['examples/cms/test/studio.browser.test.ts']

export default [
  {
    name: 'the body is stored with the printer’s trailing newline',
    edits: [{ file: input, find: '.markdown.trimEnd()', replace: '.markdown' }],
    tests: unit,
  },
  {
    name: 'a blank body is no value, which no JSON store can hold',
    edits: [{ file: input, find: "blank: '',", replace: 'blank: undefined,' }],
    tests: unit,
  },
  {
    name: 'a given text is not read into the editor',
    edits: [
      {
        file: input,
        find: 'const read = documentOf(markdown)',
        replace: "const read = documentOf('')",
      },
    ],
    tests: unit,
  },
  {
    name: 'an empty text leaves the editor no block to type in',
    edits: [{ file: input, find: 'read.children.length === 0', replace: 'false' }],
    tests: unit,
  },
  {
    name: 'the tools are each a tab stop',
    edits: [
      {
        file: '../src/views/bodyTools.ts',
        find: 'roving: model.bodyTools,',
        replace: 'roving: { current: Option.none() },',
      },
    ],
    tests: browser,
  },
  {
    name: 'Escape on a tool goes nowhere',
    edits: [
      {
        file: '../src/views/bodyTools.ts',
        find: 'returned: Message.ReturnedToBody(),',
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'returning to the body runs no focus',
    edits: [
      {
        file: '../src/apps/app.ts',
        find: 'if (selection === null) return { model }',
        replace: 'if (selection !== null) return { model }',
      },
    ],
    tests: browser,
  },
]
