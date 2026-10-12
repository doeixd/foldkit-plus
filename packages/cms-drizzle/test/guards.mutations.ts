/**
 * The CMS's audience boundary, decided by a guard set, broken in turn:
 * `pnpm mutate packages/cms-drizzle/test/guards.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = [
  'packages/cms-drizzle/test/drafts.test.ts',
  'packages/cms-drizzle/test/editor.test.ts',
  'packages/cms-drizzle/test/slug.test.ts',
]

export default [
  {
    name: 'a visitor reads unpublished work',
    edits: [
      {
        file,
        find: "Effect.map(isAuthor(principal, 'Read'), author => (author ? undefined : sql`0 = 1`))",
        replace: 'Effect.succeed(undefined)',
      },
    ],
    tests,
  },
  {
    name: 'a visitor changes unpublished work',
    edits: [
      {
        file,
        find: "Effect.flatMap(isAuthor(context.principal, 'Update'), author =>",
        replace: 'Effect.flatMap(Effect.succeed(true), author =>',
      },
    ],
    tests,
  },
  {
    name: 'a guard that refuses lets',
    edits: [{ file, find: 'decisions.some(decision => decision === true)', replace: 'true' }],
    tests,
  },
  {
    name: 'a transition’s guards are not asked',
    edits: [
      {
        file,
        find: 'onSome: guards => anyOf(guards, principal, transition),',
        replace: 'onSome: () => Effect.succeed(true),',
      },
    ],
    tests,
  },
  {
    name: 'an entry’s may forgets its transitions’ guards',
    edits: [{ file, find: 'lets.get(transition) === true &&', replace: '' }],
    tests,
  },
  {
    name: 'a transition is refused only by allow',
    edits: [{ file, find: '!lets || (entry !== undefined', replace: '(entry !== undefined' }],
    tests,
  },
  {
    name: 'a scheduled draft is changed by whoever may not schedule',
    edits: [{ file, find: "!(yield* transitionLets(principal, 'schedule')) ||", replace: '' }],
    tests,
  },
  {
    name: 'whoever scheduled a publish need not be an author when it comes due',
    edits: [{ file, find: "if (!(yield* isAuthor(principal, 'Update')))", replace: 'if (false)' }],
    tests,
  },
  {
    name: 'a content type takes another Entity’s guards',
    edits: [{ file, find: 'if (!Entity.same(entity, type.entity))', replace: 'if (false)' }],
    tests,
  },
  {
    name: 'a publishable type’s Read rule need not read whether it is published',
    edits: [
      {
        file,
        find: "if (!Guards.guardFields(entity, 'Read').includes(shown.key))",
        replace: 'if (false)',
      },
    ],
    tests,
  },
  {
    name: 'the content’s bindings are not checked',
    edits: [
      {
        file,
        find: 'GuardServer.validate(policy, {',
        replace: '((..._: ReadonlyArray<unknown>) => {})(policy, {',
      },
    ],
    tests,
  },
  {
    name: 'an archive of a row on show is not checked as an unpublish',
    edits: [
      { file, find: "if (onShow) yield* asking(principal, 'unpublish', entry)", replace: '' },
    ],
    tests,
  },
  {
    name: 'every archive is checked as an unpublish',
    edits: [
      {
        file,
        find: "if (onShow) yield* asking(principal, 'unpublish', entry)",
        replace: "yield* asking(principal, 'unpublish', entry)",
      },
    ],
    tests,
  },
]
