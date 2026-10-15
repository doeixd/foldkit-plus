/**
 * The slash menu, each part broken in turn: `pnpm mutate
 * packages/mixins-richtext/test/menu.mutations.ts` checks that a test fails for every one.
 */
const view = '../src/menu.ts'
const entries = '../../richtext-dom/src/editor.ts'
const tests = ['packages/mixins-richtext/test/menu.test.ts']

export default [
  {
    name: 'the catalogue is listed in its own order, groups split',
    edits: [
      {
        file: entries,
        find: 'if (needle.length === 0) return grouped(entries)',
        replace: 'if (needle.length === 0) return entries',
      },
    ],
    tests,
  },
  {
    name: 'matches keep the catalogue’s order',
    edits: [
      { file: entries, find: '.sort((left, right) => left.score - right.score)', replace: '' },
    ],
    tests,
  },
  {
    name: 'a narrowed menu keeps its headings',
    edits: [
      { file: view, find: "const headed = menu?.query === ''", replace: 'const headed = true' },
    ],
    tests,
  },
  {
    name: 'every entry heads its group',
    edits: [{ file: view, find: 'entry.group !== matches[index - 1]?.group', replace: 'true' }],
    tests,
  },
  {
    name: 'no description is drawn',
    edits: [
      {
        file: view,
        find: ': [h.span(slots.description.attrs(), [entry.description])]',
        replace: ': []',
      },
    ],
    tests,
  },
  {
    name: 'nothing says no entry matched',
    edits: [
      {
        file: view,
        find: "h.p(slots.empty.attrs(), ['No matches'])",
        replace: 'h.p(slots.empty.attrs(), [])',
      },
    ],
    tests,
  },
]
