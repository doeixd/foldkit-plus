/**
 * The code block, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/codeBlock.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/mixins-ui/test/codeBlock.test.ts']

const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  {
    name: 'the break that ends the code makes a numbered line',
    edits: [
      {
        file: '../src/codeBlock.ts',
        find: 'if (lines.length > 1 && lines.at(-1)?.length === 0) lines.pop()',
        replace: '',
      },
    ],
    tests: ['packages/mixins-ui/test/codeBlock.test.ts'],
  },
  {
    name: 'the final line break is dropped from the text',
    edits: [
      { file: '../src/codeBlock.ts', find: "options.code.endsWith('\\n') ?", replace: 'false ?' },
    ],
    tests: ['packages/mixins-ui/test/codeBlock.test.ts'],
  },
  {
    name: 'copying says nothing to a screen reader',
    edits: [
      {
        file: '../src/codeBlock.ts',
        find: "copy.copied === true ? [copy.copiedLabel ?? 'Copied'] : []",
        replace: '[]',
      },
    ],
    tests: ['packages/mixins-ui/test/codeBlock.test.ts'],
  },
  edit(
    'a token drawn without its kind',
    '../src/codeBlock.ts',
    "h.DataAttribute('kind', run.kind)",
    "h.DataAttribute('kind', '')",
  ),
  edit(
    'lines joined without their breaks',
    '../src/codeBlock.ts',
    "...(index === 0 ? [] : ['\\n']),",
    '...[],',
  ),
  edit(
    'a token across a break kept on one line',
    '../src/codeBlock.ts',
    "run.text.split('\\n')",
    '[run.text]',
  ),
  edit(
    'a token overlapping the one before accepted',
    '../src/codeBlock.ts',
    'token.from < at || ',
    '',
  ),
  edit(
    'a copy button that sends nothing',
    '../src/codeBlock.ts',
    '[h.OnClick(copy.onCopy(options.code))]',
    '[]',
  ),
  edit(
    'a copied button that still says Copy',
    '../src/codeBlock.ts',
    "(copy.copiedLabel ?? 'Copied')",
    "(copy.label ?? 'Copy')",
  ),
  edit(
    'line numbers never asked for',
    '../src/codeBlock.ts',
    'String(options.lineNumbers === true)',
    "'false'",
  ),
  edit(
    'a comment in the keyword color',
    '../src/recipes/codeBlock.ts',
    "'syntax-comment': { color: ref.syntax.comment,",
    "'syntax-comment': { color: ref.syntax.keyword,",
  ),
]
