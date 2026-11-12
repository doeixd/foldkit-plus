/**
 * `SSR.entry`'s `redirect` (#235, H1), broken in turn: `pnpm mutate
 * packages/ssr/test/redirect.mutations.ts` checks that a test fails for each.
 */
const index = '../src/index.ts'
const tests = ['packages/ssr/test/redirect.test.ts']

export default [
  {
    name: 'a page redirect sends elsewhere is drawn',
    edits: [{ file: index, find: 'if (Option.isSome(sentTo)) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'redirect is asked about the Model init gave, not the one prepare made',
    edits: [
      {
        file: index,
        find: 'const model =\n      prepare === undefined ? started.model : yield* Effect.orDie(prepare(started.model, request))',
        replace: 'const model = started.model',
      },
    ],
    tests,
  },
  {
    name: 'a redirect carries none of the entry’s headers',
    edits: [
      {
        file: index,
        find: 'Responded(redirected(path, request.url, headersOf(request, Option.some(model))))',
        replace: 'Responded(redirected(path, request.url, undefined))',
      },
    ],
    tests,
  },
  {
    name: 'a redirect writes headers from no Model',
    edits: [
      {
        file: index,
        find: 'Responded(redirected(path, request.url, headersOf(request, Option.some(model))))',
        replace: 'Responded(redirected(path, request.url, headersOf(request, Option.none())))',
      },
    ],
    tests,
  },
  {
    name: 'a redirect keeps the cache-control headers gave',
    edits: [
      {
        file: index,
        find: "  response.headers.set('cache-control', 'private, no-store')\n  return response",
        replace: '  return response',
      },
    ],
    tests,
  },
  {
    name: 'a redirect is kept as a page',
    edits: [
      {
        file: index,
        find: "if (result._tag !== 'Rendered' || Option.isSome(notPublic(result.status ?? 200, watched)))\n      return Option.none()",
        replace: 'if (Option.isSome(notPublic(200, watched))) return Option.none()',
      },
    ],
    tests,
  },
  {
    name: 'a redirect may leave the origin',
    edits: [{ file: index, find: 'resolved.origin !== origin ||', replace: '' }],
    tests,
  },
  {
    name: 'a redirect may resolve to two leading slashes',
    edits: [{ file: index, find: "resolved.pathname.startsWith('//')", replace: 'false' }],
    tests,
  },
  {
    name: 'a redirect may be no path',
    edits: [
      {
        file: index,
        find: "const resolved = path.startsWith('/') ? new URL(path, origin) : undefined",
        replace: 'const resolved = URL.canParse(path, origin) ? new URL(path, origin) : undefined',
      },
    ],
    tests,
  },
]
