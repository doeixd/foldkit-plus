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
  {
    name: 'a title said to fold case, which SQLite does not',
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
    name: 'placements are not verified in tests',
    edits: [
      {
        file: '../src/app.ts',
        find: 'verifyPlacement: import.meta.env?.DEV === true,',
        replace: 'verifyPlacement: false,',
      },
    ],
    tests,
  },
  {
    name: 'every placement verified is said to disagree',
    edits: [
      {
        file: '../../../packages/remote/src/model.ts',
        find: 'served.every((key, index) => key === asPlaced[index]) &&',
        replace: 'false &&',
      },
    ],
    tests,
  },
  {
    name: 'a post and its author are written apart',
    edits: [
      {
        file: '../src/server.ts',
        find: 'return db.transaction(tx => {',
        replace: 'return (tx => {',
      },
      {
        file: '../src/server.ts',
        find: '...writtenPost.patches(postRows)],\n        }\n      })',
        replace: '...writtenPost.patches(postRows)],\n        }\n      })(db)',
      },
    ],
    tests: ['examples/entity/test/server.test.ts'],
  },
  {
    name: 'a post and its comments are deleted apart',
    edits: [
      {
        file: '../src/server.ts',
        find: '      db.transaction(tx => {',
        replace: '      ;(tx => {',
      },
      {
        file: '../src/server.ts',
        find: 'tx.delete(posts).where(eq(posts.id, input.id)).run()\n      })',
        replace: 'tx.delete(posts).where(eq(posts.id, input.id)).run()\n      })(db)',
      },
    ],
    tests: ['examples/entity/test/server.test.ts'],
  },
]
