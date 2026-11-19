/**
 * The code block, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/codeBlock.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/mixins-ui/test/codeBlock.test.ts']
const browser = 'packages/mixins-ui/test/codeBlock.browser.test.ts'

const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

const browserEdit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests: [browser],
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
        find: 'copy.copied === true ? [text.copied] : []',
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
    'copy.copied === true ? text.copied : text.copy',
    'text.copy',
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
  edit(
    'the copied word given is ignored',
    '../src/codeBlock.ts',
    'copy.copied === true ? [text.copied] : [],',
    'copy.copied === true ? [words.copied] : [],',
  ),
  edit(
    'the copy word given is ignored',
    '../src/codeBlock.ts',
    'copy.copied === true ? text.copied : text.copy',
    'copy.copied === true ? text.copied : words.copy,',
  ),
  edit(
    'lines counted from one past startLine',
    '../src/codeBlock.ts',
    'const line = first + index',
    'const line = 1 + index',
  ),
  edit(
    'a mark past the last line accepted',
    '../src/codeBlock.ts',
    ' || mark.line >= first + count',
    '',
  ),
  edit(
    'a second mark on a line accepted',
    '../src/codeBlock.ts',
    'if (byLine.has(mark.line))',
    'if (false)',
  ),
  edit(
    'a fractional start accepted',
    '../src/codeBlock.ts',
    'if (!Number.isInteger(first)) throw',
    'if (false) throw',
  ),
  edit(
    'a line drawn without its mark',
    '../src/codeBlock.ts',
    "[h.DataAttribute('mark', mark)]",
    '[]',
  ),
  edit(
    'the gutter text ignored',
    '../src/codeBlock.ts',
    'gutter === undefined ? String(line) : gutter(line)',
    'String(line)',
  ),
  edit(
    'the gutters as wide as the first',
    '../src/codeBlock.ts',
    '...all.map((_, index) => numberOf(first + index).length)',
    'numberOf(first).length',
  ),
  edit(
    'a gutter drawn on every block',
    '../src/codeBlock.ts',
    'options.lineNumbers === true || onLineSelect !== undefined',
    'true',
  ),
  edit(
    'a selected line not pressed',
    '../src/codeBlock.ts',
    "String(marks.get(line) === 'selected')",
    "'false'",
  ),
  edit(
    'a gutter button that sends nothing',
    '../src/codeBlock.ts',
    'h.OnClick(onLineSelect(line)),',
    '',
  ),
  edit(
    'a collapsed block clamps every block, short or long',
    '../src/codeBlock.ts',
    'const clamped = collapsed !== undefined && all.length > collapsed.lines',
    'const clamped = collapsed !== undefined',
  ),
  edit(
    'the expand button counts the lines of the clamp',
    '../src/codeBlock.ts',
    'fill(text.expand, { count: all.length })',
    'fill(text.expand, { count: collapsed?.lines ?? 0 })',
  ),
  edit(
    'an expanded block still says it is collapsed',
    '../src/codeBlock.ts',
    "h.DataAttribute('collapsed', String(!expanded))",
    "h.DataAttribute('collapsed', 'true')",
  ),
  edit(
    'the expand button says it is closed when it is open',
    '../src/codeBlock.ts',
    'h.AriaExpanded(expanded),',
    'h.AriaExpanded(false),',
  ),
  browserEdit(
    'a collapsed block is not clipped',
    '../src/recipes/codeBlock.ts',
    "maxBlockSize: 'calc(var(--fk-code-clamp) * 1lh)',",
    '',
  ),
  browserEdit(
    'a collapsed block has no fade',
    '../src/recipes/codeBlock.ts',
    "maskImage: 'linear-gradient(to bottom, black calc(100% - 4lh), transparent)',",
    '',
  ),
  edit(
    'a collapse to no lines accepted',
    '../src/codeBlock.ts',
    'collapsed.lines >= 1',
    'collapsed.lines >= 0',
  ),
  edit(
    'no line action drawn',
    '../src/codeBlock.ts',
    'onSome: drawn => [h.span(builders.lineAction.attrs(), [drawn])],',
    'onSome: () => [],',
  ),
  edit('a wrap never written', '../src/codeBlock.ts', "[h.DataAttribute('wrap', 'true')]", '[]'),
  edit(
    'a removed line tinted as added',
    '../src/recipes/codeBlock.ts',
    'removed: { background: ref.error.subtle,',
    'removed: { background: ref.success.subtle,',
  ),
  {
    name: 'a dim line drawn at full strength',
    edits: [
      {
        file: '../src/recipes/codeBlock.ts',
        find: "dim: { opacity: ref.knob['state-disabled'] },",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a short line tinted only as far as its text',
    edits: [
      {
        file: '../src/recipes/codeBlock.ts',
        find: "        inlineSize: '100%',\n        minBlockSize: '1lh',",
        replace: "        minBlockSize: '1lh',",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the code as wide as the body, not the widest line',
    edits: [
      {
        file: '../src/recipes/codeBlock.ts',
        find: "inlineSize: 'max-content', minInlineSize: '100%'",
        replace: "minInlineSize: '100%'",
      },
    ],
    tests: [browser],
  },
  {
    name: 'each gutter as wide as its own text',
    edits: [
      {
        file: '../src/recipes/codeBlock.ts',
        find: "minInlineSize: 'var(--fk-code-gutter, 2ch)',",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a wrapped block still scrolls sideways',
    edits: [
      {
        file: '../src/recipes/codeBlock.ts',
        find: "Style.nest(wrapped, { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }),",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a floating header stays a bar',
    edits: [
      {
        file: '../src/recipes/codeBlock.ts',
        find: "            position: 'absolute',\n",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a dark block takes the page scheme',
    edits: [
      {
        file: '../src/recipes/codeBlock.ts',
        find: "dark: { root: variant(Style.self({ colorScheme: 'dark' })) },",
        replace: 'dark: {},',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a following block never scrolls to its end',
    edits: [
      {
        file: '../src/codeBlock/follow.ts',
        find: 'if (following) element.scrollTop = element.scrollHeight',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a following block pulls a reader who scrolled up',
    edits: [
      {
        file: '../src/codeBlock/follow.ts',
        find: '            following = element.scrollHeight - element.clientHeight - element.scrollTop <= NEAR\n',
        replace: '',
      },
    ],
    tests: [browser],
  },
]
