/**
 * The law over the declared writes, the page broken in turn:
 * `pnpm mutate examples/writes/test/law.mutations.ts`.
 */
const tests = ['examples/writes/test/law.test.ts']

export default [
  {
    name: 'the page shows no increment while it is pending',
    edits: [
      {
        file: '../../../packages/remote/src/mutation.ts',
        find: '...(Object.keys(bound.increments).length === 0 ? {} : { adds: bound.increments }),',
        replace: '...{},',
      },
    ],
    tests,
  },
  {
    name: 'the page reads a transition invariant as always held',
    edits: [
      {
        file: '../src/domain.ts',
        find: "Expr.not(Expr.eq(after.status, 'draft')),",
        replace: "Expr.not(Expr.eq(after.status, 'never')),",
      },
    ],
    tests,
  },
  {
    name: 'an invalid row the page could not judge read as a disagreement',
    edits: [
      {
        file: '../../../packages/remote/src/law.ts',
        find: "Data.can(model, config.mutation, config.input as never)._tag === 'Undecided'",
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'the sale declares no becomes',
    edits: [
      {
        file: '../src/domain.ts',
        find: "{ id: 'id', increment: { stock: 'quantity' }, becomes: InStock },",
        replace: "{ id: 'id', increment: { stock: 'quantity' } },",
      },
    ],
    tests,
  },
]
