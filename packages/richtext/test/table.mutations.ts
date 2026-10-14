/**
 * Tables and indentation, each step broken in turn: `pnpm mutate
 * packages/richtext/test/table.mutations.ts` checks that a test fails for every one.
 */
const table = '../src/table.ts'
const indent = '../src/indent.ts'
const command = '../src/command.ts'
const tests = ['packages/richtext/test/table.test.ts', 'packages/richtext/test/indent.test.ts']

export default [
  {
    name: 'a new row is as wide as the caret’s row',
    edits: [
      {
        file: table,
        find: 'blocks: Array.from({ length: widthOf(at.rows) }, emptyCell),',
        replace: 'blocks: Array.from({ length: cellsOf(at.rows[at.row]!).length }, emptyCell),',
      },
    ],
    tests,
  },
  {
    name: 'a row is always put after',
    edits: [
      {
        file: table,
        find: "const { row, operation } = newRow(at, at.row + (where === 'after' ? 1 : 0), mint)",
        replace: 'const { row, operation } = newRow(at, at.row + 1, mint)',
      },
    ],
    tests,
  },
  {
    name: 'a column overruns a short row',
    edits: [
      {
        file: table,
        find: 'Math.min(index, cellsOf(row).length)',
        replace: 'index',
      },
    ],
    tests,
  },
  {
    name: 'a column leaves the rows it empties',
    edits: [
      {
        file: table,
        find: 'operations.push(Edit.deleteBlock(cells.length === 1 ? row.id : cell.id))',
        replace: 'operations.push(Edit.deleteBlock(cell.id))',
      },
    ],
    tests,
  },
  {
    name: 'the last row leaves an empty table',
    edits: [
      {
        file: table,
        find: '  if (at.rows.length === 1) return { deleteTable: at.table.id }\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'Tab in the last cell goes nowhere',
    edits: [
      {
        file: table,
        find: "  if (direction === 'previous') return apply(state, [])",
        replace: '  return apply(state, [])',
      },
    ],
    tests,
  },
  {
    name: 'Tab in code moves to the next cell',
    edits: [
      {
        file: command,
        find: '    const code = linesHolder(state, options.nodes)',
        replace: '    const code = undefined as Block | undefined',
      },
    ],
    tests,
  },
  {
    name: 'a range indents only its first line',
    edits: [
      {
        file: indent,
        find: '  for (const start of linesCovered(text, ends.from, ends.to)) {',
        replace: '  for (const start of [lineStart(text, ends.from)]) {',
      },
    ],
    tests,
  },
  {
    name: 'a range indents the line it only reaches the start of',
    edits: [{ file: indent, find: 'at + 1 < to;', replace: 'at + 1 <= to;' }],
    tests,
  },
  {
    name: 'Shift+Tab removes any spaces',
    edits: [{ file: indent, find: '/^(?: {1,2}|\\t)/', replace: '/^ +/' }],
    tests,
  },
  {
    name: 'Enter keeps no indentation',
    edits: [
      {
        file: command,
        find: 'text: `\\n${indentationAt(textOfBlock(holder), offsetIn(holder, caret) ?? 0)}`,',
        replace: "text: '\\n',",
      },
    ],
    tests,
  },
]
