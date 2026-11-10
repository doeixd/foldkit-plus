/**
 * `SSR.entry`'s `answerPost: 'redirect'` (#390), broken in turn: `pnpm mutate
 * packages/ssr/test/answerPost.mutations.ts` checks that a test fails for each.
 */
const index = '../src/index.ts'
const tests = ['packages/ssr/test/fallback.test.ts']

export default [
  {
    name: 'a post is answered with the page whatever answerPost says',
    edits: [
      {
        file: index,
        find: "if (posting && options.answerPost === 'redirect') {",
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'a redirect writes headers from no Model',
    edits: [
      {
        file: index,
        find: 'const extra = yield* Effect.sync(() => headersOf(request, Option.some(model)))',
        replace: 'const extra = yield* Effect.sync(() => headersOf(request, Option.none()))',
      },
    ],
    tests,
  },
  {
    name: 'a redirect keeps the leading slashes that name another host',
    edits: [
      {
        file: index,
        find: "pathname.replace(/^\\/+/, '/')",
        replace: 'pathname',
      },
    ],
    tests,
  },
  {
    name: 'answerPost is taken for a plan with no fallback',
    edits: [
      {
        file: index,
        find: "if (options.answerPost !== undefined && plan.fallback !== 'server') {",
        replace: 'if (false) {',
      },
    ],
    tests,
  },
]
