/**
 * The drawn order, broken one piece at a time:
 * `pnpm mutate examples/cloudflare/test/order.mutations.ts`
 *
 * The D1 order is asserted in `cloudflare.test.ts`. esbuild bundles that
 * worker from the files, so a mutation applied to Vite's modules never
 * reaches it.
 */
const tests = ['examples/cloudflare/test/order.test.ts']

export default [
  {
    name: 'text is compared as UTF-16 units',
    edits: [
      {
        file: '../../../packages/entity/src/evaluate.ts',
        find: 'return fold ? byCodePoint(foldAscii(left), foldAscii(right)) : byCodePoint(left, right)',
        replace: 'return left < right ? -1 : left > right ? 1 : 0',
      },
    ],
    tests,
  },
  {
    name: 'a title said to fold case, which D1 does not',
    edits: [
      {
        file: '../src/domain.ts',
        find: 'Entity.annotateMembers({ title: Collation.of(Collation.binary) }),',
        replace: 'Entity.annotateMembers({ title: Collation.of(Collation.asciiFold) }),',
      },
    ],
    tests,
  },
  {
    name: 'title is not the order',
    edits: [
      {
        file: '../src/operations.ts',
        find: 'Query.orderBy(Order.asc(Todo.fields.title))',
        replace: 'Query.orderBy(Order.asc(Todo.fields.id))',
      },
    ],
    tests,
  },
  {
    name: 'id does not break a tie',
    edits: [
      {
        file: '../../../packages/entity/src/expr.ts',
        find: 'return endsOnId ? terms : [...terms, id]',
        replace: 'return endsOnId || id !== undefined ? terms : [...terms, id]',
      },
    ],
    tests,
  },
]
