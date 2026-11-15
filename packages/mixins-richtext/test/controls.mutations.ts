/**
 * The mark each piece puts on its root so the editor keeps the focus through a press on it, taken
 * away in turn: `pnpm mutate packages/mixins-richtext/test/controls.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = ['packages/mixins-richtext/test/controls.test.ts']
const mark = "h.Attribute(CONTROLS_ATTRIBUTE, '')"

const unmarked = (name: string, file: string, find: string, replace: string) => ({
  name: `${name} is not marked as the editor’s controls`,
  edits: [{ file, find, replace }],
  tests: unit,
})

export default [
  {
    name: 'the formatting toolbar is not marked, so a press on Bold takes the focus from the text',
    edits: [{ file: '../src/formatting.ts', find: `          ${mark},\n`, replace: '' }],
    tests: [...unit, 'packages/mixins-richtext/test/formatting.browser.test.ts'],
  },
  unmarked(
    'the mark toolbar',
    '../src/index.ts',
    `return h.div(slots.root.attrs([${mark}]), [\n      h.div(\n        slots.toolbar.attrs([h.Role('toolbar')]),`,
    `return h.div(slots.root.attrs(), [\n      h.div(\n        slots.toolbar.attrs([h.Role('toolbar')]),`,
  ),
  unmarked(
    'the block style picker',
    '../src/style.ts',
    `return h.div(slots.root.attrs([${mark}]), [\n      h.div(`,
    'return h.div(slots.root.attrs(), [\n      h.div(',
  ),
  unmarked(
    'the block style menu',
    '../src/style.ts',
    `return h.div(slots.root.attrs([${mark}]), [\n      h.button(`,
    'return h.div(slots.root.attrs(), [\n      h.button(',
  ),
  unmarked(
    'the table toolbar',
    '../src/table.ts',
    `slots.root.attrs([${mark}])`,
    'slots.root.attrs()',
  ),
  unmarked('the code toolbar', '../src/code.ts', `${mark},`, ''),
  unmarked('the slash menu', '../src/menu.ts', `slots.root.attrs([${mark}])`, 'slots.root.attrs()'),
  unmarked('the link editor', '../src/link.ts', `, ${mark}])`, '])'),
]
