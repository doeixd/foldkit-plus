/**
 * The page's layout, broken in turn: `pnpm mutate examples/chirp/test/page.mutations.ts`.
 */
const tests = ['examples/chirp/test/page.browser.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/style.ts', find, replace }],
  tests,
})

export default [
  edit(
    "the Chirp button's word is not trimmed to its capitals",
    "        textBox: 'trim-both cap alphabetic',\n",
    '',
  ),
  edit(
    'the portrait is cut out by a round wrapper',
    "portrait: [{ display: 'inline-flex', marginTop: '-2.75rem' }],",
    "portrait: [{ display: 'inline-flex', marginTop: '-2.75rem', borderRadius: '9999px', border: `4px solid ${t.surface.base}` }],",
  ),
  edit(
    'the portrait has no cutout',
    "Recipes.Avatar({ color: 'name', size: 'xl', ring: 'page' })",
    "Recipes.Avatar({ color: 'name', size: 'xl' })",
  ),
]
