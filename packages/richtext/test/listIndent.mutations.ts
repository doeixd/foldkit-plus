/**
 * Tab and Shift+Tab in a list, each broken in turn: `pnpm mutate
 * packages/richtext/test/listIndent.mutations.ts` checks that a test fails for every one.
 */
const file = '../src/command.ts'
const tests = ['packages/richtext/test/listIndent.test.ts']

export default [
  {
    name: 'a list of another kind is joined',
    edits: [
      {
        file,
        find: '    nested.kind === list.kind &&\n    sameProps(nested.props, list.props) &&\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a new list takes no props',
    edits: [
      {
        file,
        find: "      { type: 'Node', kind: list.kind, id: created, props: list.props, children: [], blocks: [] },",
        replace:
          "      { type: 'Node', kind: list.kind, id: created, props: {}, children: [], blocks: [] },",
      },
    ],
    tests,
  },
  {
    name: 'a nested item leaves its list',
    edits: [
      {
        file,
        find: '  return nestedInItem\n',
        replace: '  return false\n',
      },
    ],
    tests,
  },
  {
    name: 'Tab in a list is not taken',
    edits: [
      {
        file,
        find: '  itemAtCaret({ document, selection }, nodes) !== undefined ||\n',
        replace: '',
      },
    ],
    tests,
  },
]
