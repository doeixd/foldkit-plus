/**
 * `Clipboard.toHtml`'s rules, broken in turn: `pnpm mutate packages/data-grid/test/clipboard.mutations.ts`
 * checks that a test fails for every one.
 */
const tests = ['packages/data-grid/test/clipboard.test.ts']
const file = '../src/clipboard.ts'
const one = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  one('an ampersand is not escaped', "  '&': '&amp;',\n", ''),
  one('a less-than is not escaped', "  '<': '&lt;',\n", ''),
  one('a greater-than is not escaped', "  '>': '&gt;',\n", ''),
  one('a quote is not escaped', "  '\"': '&quot;',\n", ''),
  one('a line break stays', ".replace(/\\r\\n|\\r|\\n/g, '<br>')", ''),
  one('a CRLF is two breaks', '.replace(/\\r\\n|\\r|\\n/g, ', '.replace(/\\r|\\n/g, '),
]
