/** Mutations for `graph.overlaps`: `pnpm mutate packages/metakit/test/graph-overlaps.mutations.ts` */
const tests = ['packages/metakit/test/graph-overlaps.test.ts']

const mutation = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/graph/structure.ts', find, replace }],
  tests,
})

export default [
  mutation(
    'a write-write bridge is looked for from the first writer only',
    'if (!isUnknownEdge(we) && Option.isSome(we.path)) bridged(we, we.path.value, a.writes)',
    'if (false) bridged(we, we.path.value, a.writes)',
  ),
  mutation(
    'the pair is taken in the order given',
    'writerA <= writerB ? [writerA, writerB] : [writerB, writerA]',
    '[writerA, writerB]',
  ),
]
