/**
 * `metakit/tooling` guards broken in turn:
 * `pnpm mutate packages/metakit/test/tooling.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/metakit/test/tooling.test.ts']

export default [
  {
    name: 'makeIndex allows duplicate declaration ids',
    edits: [
      {
        file: '../src/tooling.ts',
        find: `      if (rawById.has(entry.id)) {
        return yield* Effect.fail(`,
        replace: `      if (false && rawById.has(entry.id)) {
        return yield* Effect.fail(`,
      },
    ],
    tests,
  },
  {
    name: 'diagnostics skips missing dependency check (MK001)',
    edits: [
      {
        file: '../src/tooling.ts',
        find: `              if (!infos.has(dep)) {
                diags.push({
                  code: 'MK001',`,
        replace: `              if (false && !infos.has(dep)) {
                diags.push({
                  code: 'MK001',`,
      },
    ],
    tests,
  },
  {
    name: 'walkDeps ignores dependency cycles (MK002)',
    edits: [
      {
        file: '../src/tooling.ts',
        find: `          if (onStackSet.has(dep)) {
            const idx = onStack.indexOf(dep)
            cycles.push([...onStack.slice(idx), dep])`,
        replace: `          if (false && onStackSet.has(dep)) {
            const idx = onStack.indexOf(dep)
            cycles.push([...onStack.slice(idx), dep])`,
      },
    ],
    tests,
  },
  {
    name: 'semanticDiff treats changed fingerprint as unchanged',
    edits: [
      {
        file: '../src/tooling.ts',
        find: `      if (sameFp && !readsChanged && !writesChanged && prev.kind === next.kind) {
        unchanged.push(id)`,
        replace: `      if (true || (sameFp && !readsChanged && !writesChanged && prev.kind === next.kind)) {
        unchanged.push(id)`,
      },
    ],
    tests,
  },
]
