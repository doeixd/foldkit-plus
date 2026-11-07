/**
 * `Data.confirmed` reads past what is only pending, broken in turn:
 * `pnpm mutate packages/remote/test/confirmed.mutations.ts`.
 */
const tests = ['packages/remote/test/domain.test.ts']
const domain = '../src/domain.ts'
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: domain, find, replace }],
  tests,
})

export default [
  edit(
    'confirmed reads the optimistic layers too',
    'read: (root: AppModel) => projection.read(withoutOptimistic(bound, root)),',
    'read: (root: AppModel) => projection.read(root),',
  ),
  edit(
    'a pending layer is left when no overlay is pending',
    'bound.store.set(model, { ...remote, optimistic: emptyOptimistic } as Store)',
    'bound.store.set(model, {\n        ...remote,\n        optimistic: { ...remote.optimistic, layers: remote.optimistic.layers },\n      } as Store)',
  ),
  edit(
    'a pending overlay is left when a layer is cleared',
    'bound.store.set(model, { ...remote, optimistic: emptyOptimistic } as Store)',
    'bound.store.set(model, {\n        ...remote,\n        optimistic: { ...remote.optimistic, overlays: remote.optimistic.overlays },\n      } as Store)',
  ),
  edit(
    'confirmed plans differently from the projection',
    '  ...projection,\n  read: (root: AppModel) => projection.read(withoutOptimistic',
    '  read: (root: AppModel) => projection.read(withoutOptimistic',
  ),
]
