/**
 * Footnotes, each part broken in turn: `pnpm mutate packages/richtext/test/footnote.mutations.ts`
 * checks that a test fails for every one.
 */
const footnote = '../src/footnote.ts'
const command = '../src/command.ts'
const tests = ['packages/richtext/test/footnote.test.ts']

export default [
  {
    name: 'definitions nothing refers to are left out',
    edits: [
      {
        file: footnote,
        find: 'const labels = [...references.keys(), ...[...definitions.keys()].filter(l => !references.has(l))]',
        replace: 'const labels = [...references.keys()]',
      },
    ],
    tests,
  },
  {
    name: 'the next label counts past gaps',
    edits: [
      {
        file: footnote,
        find: 'return String(n)\n}',
        replace: 'return String(used.size + 1)\n}',
      },
    ],
    tests,
  },
  {
    name: 'a footnote goes at the start of a range',
    edits: [
      {
        file: command,
        find: 'const end = start === selection.anchor ? selection.focus : selection.anchor',
        replace: 'const end = start',
      },
    ],
    tests,
  },
  {
    name: 'a footnote reference carries no mark',
    edits: [
      {
        file: command,
        find: "{ type: 'InsertText', text: label, marks: [FootnoteRef.of({ label })] },",
        replace: "{ type: 'InsertText', text: label },",
      },
    ],
    tests,
  },
  {
    name: 'a rename takes a label in use',
    edits: [
      {
        file: command,
        find: '(to !== from && notes.some(each => each.label === to))',
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'a rename rewrites a reference that shows a mark',
    edits: [
      { file: command, find: 'text: run.text === from ? to : run.text,', replace: 'text: to,' },
    ],
    tests,
  },
  {
    name: 'a rename leaves the definition’s label',
    edits: [
      {
        file: command,
        find: "[{ type: 'SetProps' as const, node: note.definition, props: { label: to } }]),",
        replace: '[]),',
      },
    ],
    tests,
  },
  {
    name: 'a rename leaves the caret after the last reference',
    edits: [
      {
        file: command,
        find: "...(inReference || selection === null ? [] : [{ type: 'SetSelection' as const, selection }]),",
        replace: '',
      },
    ],
    tests,
  },
]
