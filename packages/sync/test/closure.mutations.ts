/**
 * `Sync.mount`'s closure check: `pnpm mutate packages/sync/test/closure.mutations.ts`.
 */
const tests = ['packages/sync/test/closure.test.ts']

export default [
  {
    name: 'the comparison is dropped',
    edits: [
      {
        file: '../src/mount.ts',
        find: '      return Closure.reads(app, sync.projection, model, message)',
        replace: '      return []',
      },
    ],
    tests,
  },
  {
    // `reads` compares the live Model with itself reset, so a slice read from the replica
    // moves both sides together: the refusal is the same.
    name: "the comparison is made over the replica's committed slice",
    edits: [
      {
        file: '../src/mount.ts',
        find: '      return Closure.reads(app, sync.projection, model, message)',
        replace:
          '      return Closure.reads(app, sync.projection, sync.projection.set(model, Effect.runSync(replica.snapshot).shared), message)',
      },
    ],
    tests,
    survives:
      'the check holds whatever slice it runs over, since both of its runs start from the same one; a pending edit cannot move it',
  },
  {
    name: 'a refused Message is still submitted',
    edits: [
      {
        file: '../src/mount.ts',
        find: '    if (outside.length > 0) {',
        replace: '    if (outside.length > 0 && false) {',
      },
    ],
    tests,
  },
  {
    name: 'a refused Message is applied to the Model',
    edits: [
      {
        file: '../src/mount.ts',
        find: "      return {\n        model,\n        commands: [\n          {\n            name: 'foldkit-sync/closure'",
        replace:
          "      return {\n        model: result.model,\n        commands: [\n          {\n            name: 'foldkit-sync/closure'",
      },
    ],
    tests,
  },
  {
    name: 'the refusal names no field',
    edits: [
      {
        file: '../src/mount.ts',
        find: "shared projection: ${outside.join(', ')}`",
        replace: 'shared projection`',
      },
    ],
    tests,
  },
  {
    name: 'a refusal is not counted as owed, so `settled` resolves early',
    edits: [
      {
        file: '../src/mount.ts',
        find: '      persistsOwed++\n      const error',
        replace: '      const error',
      },
    ],
    tests,
  },
]
