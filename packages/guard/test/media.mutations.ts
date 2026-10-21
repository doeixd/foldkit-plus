/**
 * `foldkit-guard/media`, broken in turn:
 * `pnpm mutate packages/guard/test/media.mutations.ts` checks that a test
 * fails for every one.
 */
const media = '../src/media.ts'
const tests = ['packages/guard/test/media.test.ts']

export default [
  {
    name: 'every guard must allow, not any one',
    edits: [
      {
        file: media,
        find: 'for (const guard of config[route] ?? []) {',
        replace: 'for (const guard of (config[route] ?? []).slice(0, 1)) {',
      },
    ],
    tests,
  },
  {
    name: 'whoever the guards refuse is admitted',
    edits: [{ file: media, find: 'return yield* new UploadForbidden({})', replace: 'return' }],
    tests,
  },
  {
    name: 'every route is decided as an upload',
    edits: [
      {
        file: media,
        find: 'for (const guard of config[route] ?? []) {',
        replace: 'for (const guard of config.Upload ?? []) {',
      },
    ],
    tests,
  },
  {
    name: 'the resolver is handed the request, body and all',
    edits: [
      {
        file: media,
        find: 'url => new Request(url, { method: request.method, headers: request.headers }),',
        replace: '() => request.source as Request,',
      },
    ],
    tests,
  },
  {
    name: 'a session that ended reads as forbidden',
    edits: [
      {
        file: media,
        find: '.pipe(Effect.mapError(() => new UploadUnauthenticated({})))',
        replace: '.pipe(Effect.mapError(() => new UploadForbidden({})))',
      },
    ],
    tests,
  },
  {
    name: 'the URL is rebuilt from the headers on the web too',
    edits: [{ file: media, find: 'URL.canParse(request.originalUrl)', replace: 'false' }],
    tests,
  },
]
