/**
 * A placed child's drawing kept while its Model is the same object (#431),
 * each piece broken: `pnpm mutate packages/bundle/test/memo.mutations.ts`.
 */
const tests = ['packages/bundle/test/memo.test.ts']
const edit = (
  name: string,
  file: string,
  find: string,
  replace: string,
  over: ReadonlyArray<string> = tests,
) => ({ name, edits: [{ file, find, replace }], tests: over })

export default [
  edit(
    'a placement draws its child on every render',
    '../src/placed.ts',
    ': keptIn(slotId, childView)(model, h)',
    ': h.submodel({ slotId, model, view: childView, toParentMessage: link.toParentMessage })',
  ),
  edit(
    'a placement keeps its drawing whatever memo says',
    '../src/placed.ts',
    'config.memo === false',
    'false',
  ),
  edit(
    'a placement keeps a new memo every render',
    '../src/placed.ts',
    'kept.set(slotId, made)',
    '',
  ),
  edit(
    'a Link.child draws on every render',
    '../src/link.ts',
    'options.memo === false ? drawChild : keptDrawing(drawChild)',
    'drawChild',
  ),
  edit(
    'a Link.child keeps its drawing whatever memo says',
    '../src/link.ts',
    'options.memo === false ? drawChild : keptDrawing(drawChild)',
    'keptDrawing(drawChild)',
  ),
  // Drawn where no runtime frame is (a Scene, an inert test): the slot throws first.
  edit(
    'a placement drawn without a frame throws',
    '../src/memo.ts',
    'if (started !== before) throw error',
    'throw error',
    ['packages/bundle/test'],
  ),
  edit(
    'a server render keeps a drawing',
    '../src/memo.ts',
    'if ((globalThis as Record<symbol, unknown>)[SERVER_RENDER] === true) return draw(model, h)',
    '',
  ),
  edit(
    'a collection item is drawn on every render',
    '../src/collection.ts',
    ': keptFor(parent, key, childView)(model, h)',
    ': drawItem(key, model, h, childView)',
  ),
  edit(
    'a collection keeps its items whatever memo says',
    '../src/collection.ts',
    '? config.memo === false',
    '? false',
  ),
  edit(
    'a collection keeps a new memo every render',
    '../src/collection.ts',
    'kept.set(key, made)',
    '',
  ),
  {
    name: 'a collection keeps the drawing of every item it ever held',
    edits: [
      { file: '../src/collection.ts', find: 'kept.size >= 2 * entries.length', replace: 'false' },
    ],
    tests,
    survives:
      'Only memory: a kept drawing of a removed item is the right drawing of the same Model, so nothing a test can read shows it.',
  },
  edit(
    'a collection lists its entries again for every item it draws',
    '../src/collection.ts',
    'if (listed !== undefined && listed.parent === parent) return listed.entries',
    '',
  ),
]
