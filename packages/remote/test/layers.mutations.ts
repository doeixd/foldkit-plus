/**
 * Optimistic layers and overlays: later ones win, a failure removes exactly
 * its own, settling one keeps the other. `pnpm mutate packages/remote/test/layers.mutations.ts`.
 */
const tests = [
  'packages/remote/test/optimistic.test.ts',
  'packages/remote/test/optimisticMutation.test.ts',
]
const optimistic = '../src/optimistic.ts'
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: optimistic, find, replace }],
  tests,
})

export default [
  edit(
    'a layer added later loses to an earlier one',
    'layers: [...optimistic.layers, layer],',
    'layers: [layer, ...optimistic.layers],',
  ),
  edit(
    'a request begun later loses to an earlier one',
    ': [...optimistic.layers, { id: requestId, patches, deletes, viewer }],',
    ': [{ id: requestId, patches, deletes, viewer }, ...optimistic.layers],',
  ),
  edit(
    'pending prepends read oldest first',
    "for (const overlay of position === 'prepend' ? [...ordered].reverse() : ordered) {",
    'for (const overlay of ordered) {',
  ),
  edit(
    'a failure removes every layer',
    'const layers = optimistic.layers.filter(layer => layer.id !== id)',
    'const layers = optimistic.layers.filter(() => false)',
  ),
  edit(
    'a failure removes the layers it does not own',
    'const layers = optimistic.layers.filter(layer => layer.id !== id)',
    'const layers = optimistic.layers.filter(layer => layer.id === id)',
  ),
  edit(
    'a failure leaves the overlays of its request',
    'removeOverlay(removeLayer(optimistic, requestId), requestId)',
    'removeLayer(optimistic, requestId)',
  ),
  edit(
    'settling one prepend removes every overlay',
    'const overlays = optimistic.overlays.filter(overlay => overlay.id !== id)',
    'const overlays = optimistic.overlays.filter(() => false)',
  ),
]
