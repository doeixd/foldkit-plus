/**
 * An empty line's `<br>`, each step broken in turn: `pnpm mutate
 * packages/richtext-dom/test/filler.mutations.ts` checks that a test fails for every one.
 */
const tests = ['packages/richtext-dom/test/filler.test.ts']

export default [
  {
    name: 'no line gets a filler',
    edits: [
      {
        file: '../src/filler.ts',
        find: "  block.children.every(run => run.text === '')",
        replace: '  false',
      },
    ],
    tests,
  },
  {
    name: 'a line with text keeps its filler',
    edits: [
      {
        file: '../src/index.ts',
        find: '  if (!needsFiller(block)) return filler?.remove()',
        replace: '  if (!needsFiller(block)) return',
      },
    ],
    tests,
  },
  {
    name: 'a redrawn run goes after the filler',
    edits: [
      {
        file: '../src/index.ts',
        find: '    else if (filler !== undefined) filler.before(fresh)\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the caret on an empty line goes in its empty text',
    edits: [
      {
        file: '../src/index.ts',
        find: '  if (filler !== undefined && position.offset === 0 && texts.every(text => text.length === 0)) {',
        replace: '  if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'a caret on an element is not restored',
    edits: [
      {
        file: '../src/events.ts',
        find: '  return range === undefined ? undefined : { node: range.startContainer, offset: range.startOffset }',
        replace:
          '  return range === undefined || !(range.startContainer instanceof Text) ? undefined : { node: range.startContainer, offset: range.startOffset }',
      },
    ],
    tests,
  },
  {
    name: 'an import reads the filler as a break',
    edits: [
      {
        file: '../src/html.ts',
        find: '`[${RichText.ADORNMENT_ATTRIBUTE}], [${FILLER_ATTRIBUTE}]`',
        replace: '`[${RichText.ADORNMENT_ATTRIBUTE}]`',
      },
    ],
    tests,
  },
]
