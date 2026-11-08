/**
 * `Theme.prune` and the plugin's `prune` option (#487), broken:
 * `pnpm mutate packages/mixins/test/prune.mutations.ts`.
 */
const tests = ['packages/mixins/test/prune.test.ts', 'packages/mixins/test/viteStyles.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
const prune = '../src/theme/prune.ts'
const vite = '../src/vite.ts'

export default [
  edit(
    'what the rules read is not kept',
    prune,
    'for (const name of readsOf(outside)) kept.add(name)',
    '',
  ),
  edit('what a kept token reads is not followed', prune, 'pending.push(read)', ''),
  edit('an unread registration stays', prune, '[...defined, ...registered]', '[...defined]'),
  edit('what a script reads is not kept', prune, 'new Set(READ_BY_SCRIPT)', 'new Set<string>()'),
  edit(
    'a string does not hide a semicolon',
    prune,
    `else if (char === '"' || char === "'") quote = char`,
    'else if (false) quote = char',
  ),
  edit(
    'parentheses do not hide a semicolon',
    prune,
    "else if (char === '(') depth++",
    'else if (false) depth++',
  ),
  edit("a removed value leaves its ';'", prune, "css[end] === ';' ? end + 1 : end", 'end'),
  edit(
    'a keep entry naming nothing is ignored',
    prune,
    'if (names === null) throw',
    'if (names === null) return css; if (false) throw',
  ),
  edit(
    'the plugin never prunes',
    vite,
    'options.prune === undefined ? css : prune(css, options.prune)',
    'css',
  ),
  edit('dev serves the whole sheet', vite, 'shipped(String(loaded.css))', 'String(loaded.css)'),
]
