/**
 * The footnote preview, each part broken in turn: `pnpm mutate
 * packages/mixins-richtext/test/footnote.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/footnote.ts'
const tests = ['packages/mixins-richtext/test/footnote.test.ts']

export default [
  {
    name: 'the preview shows away from a reference',
    edits: [
      {
        file,
        find: 'if (label === undefined) return h.empty',
        replace: "if (label === undefined) return h.div(slots.root.attrs([h.Role('group')]), [])",
      },
    ],
    tests,
  },
  {
    name: 'a missing note reads as empty',
    edits: [{ file, find: "'No note yet'", replace: "''" }],
    tests,
  },
  {
    name: 'Go to note is open with no definition',
    edits: [{ file, find: 'h.Disabled(definition === undefined),', replace: 'h.Disabled(false),' }],
    tests,
  },
  {
    name: 'a rename names no old label',
    edits: [
      {
        file,
        find: 'RenamedFootnote({ from: label, to })',
        replace: "RenamedFootnote({ from: '', to })",
      },
    ],
    tests,
  },
]
