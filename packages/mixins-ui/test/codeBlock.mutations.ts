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
