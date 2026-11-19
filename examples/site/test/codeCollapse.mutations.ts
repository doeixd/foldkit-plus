/**
 * The site's collapsed code blocks, broken in turn:
 * `pnpm mutate examples/site/test/codeCollapse.mutations.ts`.
 */
const tests = ['examples/site/test/codeCollapse.browser.test.ts']

const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a long block is drawn whole',
    '../src/content/render.ts',
    'lines.length > COLLAPSE_ABOVE',
    'false',
  ),
  edit(
    'a short block is collapsed too',
    '../src/content/render.ts',
    'lines.length > COLLAPSE_ABOVE',
    'lines.length > 3',
  ),
  edit(
    'a block opens to its first three lines',
    '../src/content/render.ts',
    'const COLLAPSED_LINES = 12',
    'const COLLAPSED_LINES = 3',
  ),
  edit(
    'the expand button is not found by the page’s script',
    '../src/content/render.ts',
    "expand: { attributes: ({ h }) => [h.Attribute(EXPAND_ATTRIBUTE, '')] },",
    '',
  ),
  edit(
    'a press leaves the block collapsed',
    '../src/shell.ts',
    "figure.dataset['collapsed'] = String(!open)",
    '',
  ),
  edit(
    'a press leaves the button saying it is closed',
    '../src/shell.ts',
    "button.setAttribute('aria-expanded', String(open))",
    '',
  ),
  edit(
    'the button keeps its words once pressed',
    '../src/shell.ts',
    "button.textContent = button.dataset['toggledLabel'] ?? shown",
    '',
  ),
  edit(
    'a press takes the focus off the button',
    '../src/shell.ts',
    "if (!open) button.scrollIntoView({ block: 'nearest' })",
    'button.blur()',
  ),
]
