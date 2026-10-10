/**
 * The example's own claims, each broken in turn: `pnpm mutate
 * examples/entity/test/entity.mutations.ts`.
 */
const tests = ['examples/entity/test/http.test.ts', 'examples/entity/test/demo.test.ts']

export default [
  {
    name: 'a title declares no collation, so a rename cannot be placed',
    edits: [
      {
        file: '../src/domain.ts',
        find: 'Entity.annotateMembers({ title: Collation.of(Collation.binary) }),',
        replace: 'Entity.annotateMembers({}),',
      },
    ],
    tests,
  },
  {
    name: 'the posts body leaves its order to the server',
    edits: [
      {
        file: '../src/operations.ts',
        find: 'Query.orderBy(Order.chosen(input.sort, { title: Blog.Post.fields.title })),',
        replace: 'Query.orderBy(),',
      },
    ],
    tests,
  },
]
