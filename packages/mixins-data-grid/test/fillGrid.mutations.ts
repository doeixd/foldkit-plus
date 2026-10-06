/**
 * Filling through the grid, broken in turn: its Messages, its keys, its
 * handle and the preview. `pnpm mutate packages/mixins-data-grid/test/fillGrid.mutations.ts`
 * checks that a test fails for every one; `Fill`'s own rules are
 * `packages/data-grid/test/fill.mutations.ts`.
 */
const tests = [
  'packages/data-grid/test/grid.test.ts',
  'packages/mixins-data-grid/test/editing.test.ts',
  'packages/mixins-data-grid/test/editing.browser.test.ts',
]
const grid = '../../data-grid/src/grid.ts'
const view = '../src/view.ts'
const drag = '../src/fillDrag.ts'
const one = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  one(
    'a drag fills from the focused cell over a range',
    grid,
    'Option.orElse(model.selection.cells, () =>',
    'Option.orElse(Option.none(), () =>',
  ),
  one('the same cell again makes a new Model', grid, 'sameCell(filling.to, to)\n', 'false\n'),
  one(
    'a cancelled fill fills',
    grid,
    '              return completed\n',
    '              return true\n',
  ),
  one(
    'Ctrl+D over a range fills from the row above it',
    view,
    'const from = rows.end - rows.start > 1 ? rows.start : rows.start - 1',
    'const from = rows.start - 1',
  ),
  one(
    'Ctrl+R over a range fills from the column before it',
    view,
    'const from = columns.length > 1 ? first : projection.columns[at - 1]',
    'const from = projection.columns[at - 1]',
  ),
  one(
    'Shift turns no fill away',
    view,
    'if (!editsAny || !toggle || modifiers.shiftKey || modifiers.altKey) return Option.none()',
    'if (!editsAny || !toggle || modifiers.altKey) return Option.none()',
  ),
  one('Escape lets no fill go', view, "key === 'Escape' && Option.isSome(state.filling)", 'false'),
  one(
    'the preview is not drawn',
    view,
    "...(filled ? [h.DataAttribute('fill', 'target')] : []),",
    '',
  ),
  one('no handle is drawn', view, '...(handled ? [fillHandle] : []),', ''),
  one(
    'the cell under a captured pointer is its target',
    drag,
    'page.elementFromPoint(x, y)?.closest',
    '(event.target as Element | null)?.closest',
  ),
  one(
    "the handle's click reaches its cell",
    drag,
    "element.addEventListener('click', onClick)",
    '',
  ),
]
