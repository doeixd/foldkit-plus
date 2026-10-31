/**
 * A pending delete hiding its row everywhere, broken in turn:
 * `pnpm mutate packages/remote/test/pendingDelete.mutations.ts`.
 */
const tests = [
  'packages/remote/test/pendingDelete.test.ts',
  'packages/remote/test/write.test.ts',
  'packages/remote/test/heldValue.test.ts',
]
const optimistic = '../src/optimistic.ts'

export default [
  {
    name: 'an earlier edit keeps its patch of a row a later delete settled',
    edits: [
      {
        file: optimistic,
        find: '  if (at === undefined || deleted.length === 0) return optimistic',
        replace: '  if (at !== -1) return optimistic',
      },
    ],
    tests,
  },
  {
    name: 'a later edit loses its patch of a row an earlier delete settled',
    edits: [
      {
        file: optimistic,
        find: 'if (started === undefined || started > at) return layer',
        replace: 'if (started === undefined) return layer',
      },
    ],
    tests,
  },
  {
    name: 'a pending patch never shows over a row the server deleted',
    edits: [
      {
        file: optimistic,
        find: '      resolvedPatches(base, optimistic, operators).map(patch => {',
        replace:
          '      resolvedPatches(base, optimistic, operators).filter(patch => !isTombstone(base, entityKey(patch.entity, patch.id))).map(patch => {',
      },
    ],
    tests,
  },
  {
    name: 'a request keeps no deletion of its own',
    edits: [
      {
        file: optimistic,
        find: "else if (operation._tag === 'Delete') deletes.push(operation)",
        replace: "else if (operation._tag === 'Delete') void operation",
      },
    ],
    tests,
  },
  {
    name: 'a request that only deletes has no layer',
    edits: [
      {
        file: optimistic,
        find: '      patches.length === 0 && deletes.length === 0\n        ? optimistic.layers',
        replace: '      patches.length === 0\n        ? optimistic.layers',
      },
    ],
    tests,
  },
  {
    name: 'a read still shows a row a pending layer deletes',
    edits: [
      {
        file: optimistic,
        find: '  [...pendingDeletes(optimistic)].reduce(',
        replace: '  [...new Set<EntityKey>()].reduce(',
      },
    ],
    tests,
  },
  {
    name: 'a pending patch made after a delete brings its row back',
    edits: [
      {
        file: optimistic,
        find: '  [...pendingDeletes(optimistic)].reduce(\n    tombstone,\n    writeEntities(\n      base,',
        replace: '  writeEntities(\n      [...pendingDeletes(optimistic)].reduce(tombstone, base),',
      },
      {
        file: optimistic,
        find: '      }),\n    ),\n  )\n\nconst pendingDeletes',
        replace: '      }),\n    )\n\nconst pendingDeletes',
      },
    ],
    tests,
  },
  {
    name: 'a list hides only what the server deleted',
    edits: [
      {
        file: optimistic,
        find: 'return key => deleted.has(key) || isTombstone(store, key)',
        replace: 'return key => isTombstone(store, key)',
      },
    ],
    tests,
  },
  {
    name: 'a list read ignores pending deletes',
    edits: [
      {
        file: '../src/layers.ts',
        find: 'placed.overlays, goneIn(entities, optimistic))',
        replace: 'placed.overlays, goneIn(entities, { ...optimistic, layers: [] }))',
      },
    ],
    tests,
  },
  {
    name: 'a declared delete shows nothing until the server answers',
    edits: [
      {
        file: '../src/mutation.ts',
        find: "return [{ _tag: 'Delete', entity, id }]",
        replace: 'return [] as never',
      },
    ],
    tests,
  },
  {
    name: 'retention drops a row a pending request deletes',
    edits: [
      {
        file: '../src/retain.ts',
        find: '    for (const gone of layer.deletes) walk.add(entityKey(gone.entity, gone.id))',
        replace: '',
      },
    ],
    tests,
  },
]
