/**
 * Footnotes in Markdown, each part broken in turn: `pnpm mutate
 * packages/richtext-markdown/test/footnotes.mutations.ts` checks that a test fails for every one.
 */
const parse = '../src/parse.ts'
const print = '../src/print.ts'
const caret = '../src/caret.ts'
const tests = ['packages/richtext-markdown/test/footnotes.test.ts']

export default [
  {
    name: 'references read without asking',
    edits: [
      {
        file: parse,
        find: "if (reading.footnotes !== true) {\n            diagnostics.push({ code: 'UnsupportedNode', detail: 'footnoteReference' })",
        replace:
          "if (false) {\n            diagnostics.push({ code: 'UnsupportedNode', detail: 'footnoteReference' })",
      },
    ],
    tests,
  },
  {
    name: 'a reference’s source starts at its bracket',
    edits: [
      {
        file: parse,
        find: 'const start = (node.position?.start.offset ?? 0) + 2',
        replace: 'const start = node.position?.start.offset ?? 0',
      },
    ],
    tests,
  },
  {
    name: 'a reference prints its label bare',
    edits: [
      {
        file: print,
        find: 'footnote !== undefined ? `[^${footnote}]` :',
        replace: 'footnote !== undefined ? footnote :',
      },
    ],
    tests,
  },
  {
    name: 'a note’s later lines are not indented',
    edits: [{ file: print, find: "(line.length === 0 ? '' : `    ${line}`)", replace: '(line)' }],
    tests,
  },
  {
    name: 'any label prints',
    edits: [
      {
        file: print,
        find: "return typeof label === 'string' && FOOTNOTE_LABEL.test(label) ? label : undefined",
        replace: "return typeof label === 'string' ? label : undefined",
      },
    ],
    tests,
  },
  {
    name: 'the caret mapping skips footnotes',
    edits: [
      { file: caret, find: '`caret-${n++}`, footnotes: true })', replace: '`caret-${n++}` })' },
    ],
    tests,
  },
]
