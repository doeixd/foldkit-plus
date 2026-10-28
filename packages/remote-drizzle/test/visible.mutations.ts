/**
 * A binding's visible rows, dropped on each path a table is read by:
 * `pnpm mutate packages/remote-drizzle/test/visible.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = ['packages/remote-drizzle/test/visible.test.ts']

export default [
  {
    name: 'a rule answered as an Effect is used as SQL',
    edits: [
      {
        file,
        find: 'return Effect.isEffect(visible) ? visible : Effect.succeed(visible)',
        replace: 'return Effect.succeed(visible as never)',
      },
    ],
    tests,
  },
  {
    name: 'a read by id ignores the rule',
    edits: [
      {
        file,
        find: '            yield* visibleFor(binding, context.principal),',
        replace: '            undefined,',
      },
    ],
    tests,
  },
  {
    name: "a relation ignores its target's rule",
    edits: [
      {
        file,
        find: 'const targetVisible = yield* visibleFor(relation.entity, context.principal)',
        replace: 'const targetVisible = undefined',
      },
    ],
    tests,
  },
  {
    name: 'a count ignores the rule',
    edits: [
      {
        file,
        find: 'const countVisible = yield* visibleFor(relation.entity, context.principal)',
        replace: 'const countVisible = undefined',
      },
    ],
    tests,
  },
  {
    name: 'a query ignores the rule',
    edits: [
      {
        file,
        find: 'const visible = yield* visibleFor(binding, principal)',
        replace: 'const visible = undefined',
      },
    ],
    tests,
  },
  {
    name: 'a relation page’s cursor is placed by a row hidden from its reader',
    edits: [
      {
        file,
        find: '{ where: and(eq(targetId, cursorId(shape.cursor)), targetVisible), limit: 1 },',
        replace: '{ where: eq(targetId, cursorId(shape.cursor)), limit: 1 },',
      },
    ],
    tests,
  },
]
