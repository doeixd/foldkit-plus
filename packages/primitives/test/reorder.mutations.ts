/**
 * `Reorder`, broken in turn:
 * `pnpm mutate packages/primitives/test/reorder.mutations.ts` checks that a
 * test fails for every one. The cycle guard in `ancestors` is not mutated: a
 * walk with it removed never ends, and a synchronous loop outlives every
 * test timeout.
 */
const source = '../src/interaction/reorder.ts'
const unit = 'packages/primitives/test/reorder.test.ts'
const browser = 'packages/primitives/test/reorder.browser.test.ts'

const one = (name: string, find: string, replace: string, tests: ReadonlyArray<string>) => ({
  name,
  edits: [{ file: source, find, replace }],
  tests,
})

export default [
  one(
    'focus leaving puts back a pointer drag too',
    "held.id === id && held.by === 'keys'",
    'held.id === id',
    [unit],
  ),
  one(
    'a step starts from the first place, not from where the item is',
    'onSome: current => places.findIndex(place => samePlace(place, current)),',
    'onSome: () => -1,',
    [unit, browser],
  ),
  one('an unchanged place is reported again', 'sameOver(next, model.over)', 'false', [unit]),
  one(
    'a pointer drop lands where the pointer was last seen',
    'Released: ({ over: at }) => holding(held => finish(held, at)),',
    'Released: () => holding(held => finish(held, model.over)),',
    [unit],
  ),
  one(
    "the held row's own rows are offered as places",
    'const rows = options.items.filter(id => !within(id, options.held, parentOf))',
    'const rows = options.items.filter(id => id !== options.held)',
    [unit],
  ),
  one(
    'a folder gets no inside place',
    "if (accepts(id) && !opens) found.push({ id, zone: 'inside' })",
    '',
    [unit],
  ),
  one('a branch that ends gets no place after it', "found.push({ id: at, zone: 'after' })", '', [
    unit,
    browser,
  ]),
  one(
    'a key grab does not start before the next sibling',
    "...(next !== undefined && isSibling(next) ? [{ id: next, zone: 'before' as const }] : []),",
    '',
    [unit, browser],
  ),
  one('inside a later row lands before it', 'inside: downward ? at + 1 : at', 'inside: at', [unit]),
  one(
    'a descendant is not refused',
    'for (const above of ancestors(id, parent)) if (above === ancestor) return true',
    '',
    [unit],
  ),
  one(
    'Left and Right do not swap under RTL',
    "const forward = direction === 'rtl' ? 'ArrowLeft' : 'ArrowRight'",
    "const forward = 'ArrowRight'",
    [unit],
  ),
  one(
    'the route forgets its own grab until the next drawing',
    'const held = answered.has(input)',
    'const held = false',
    [unit, browser],
  ),
  one(
    'focus leaving the handle is not heard',
    'onSome: id => [h.OnBlur(wrap(Message.Left({ id })))],',
    'onSome: () => [],',
    [browser],
  ),
  one('items carry no mark the pointer finds', 'h.Attribute(mark, id),', '', [browser]),
  one(
    'the drop line is drawn on every other row',
    "over.id === id ? [h.DataAttribute('reorder-over', over.zone)] : []",
    "over.id !== id ? [h.DataAttribute('reorder-over', over.zone)] : []",
    [browser],
  ),
]
