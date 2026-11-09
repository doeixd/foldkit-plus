/**
 * The file routes, broken in turn:
 * `pnpm mutate packages/media/test/files.mutations.ts`.
 */
const files = '../src/server/files.ts'
const tests = ['packages/media/test/files.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: files, find, replace }],
  tests,
})

export default [
  edit(
    'anyone may upload',
    'const owner = yield* uploadPolicy.admit(request)',
    "const owner = 'ada'",
  ),
  edit('an empty owner uploads', "if (owner === '') {", 'if (false) {'),
  edit('an empty owner goes unreported', 'yield* Diagnostics.report(ownerMissing)\n', ''),
  edit(
    'any request type uploads',
    "!Option.contains(\n                mediaTypeOf(request.headers['content-type']),\n                'application/octet-stream',\n              )",
    'false',
  ),
  edit(
    'any name uploads',
    'if (Option.isNone(name)) return refused(400',
    'if (false) return refused(400',
  ),
  edit(
    'any type uploads',
    "Option.filter(mediaTypeOf(request.headers['x-foldkit-file-type']), accepts)",
    "Option.some(request.headers['x-foldkit-file-type'] ?? '')",
  ),
  edit('Admission goes unasked', 'yield* admit(`files:${owner}`)\n', ''),
  edit('Admission is asked by request, not owner', 'admit(`files:${owner}`)', "admit('files:')"),
  edit('a body is unbounded', 'if (size > maxBytes) return', 'if (false) return'),
  edit('a slow body runs on', 'if (inWindow < floor) return', 'if (false) return'),
  edit('slots are unlimited', 'Semaphore.make(maxConcurrent)', 'Semaphore.make(1000)'),
  edit(
    'an owner may upload twice at once',
    'if (uploading.has(owner)) return Effect.succeedNone',
    '',
  ),
  edit(
    "an owner's slot is never freed",
    'Effect.ensuring(Effect.sync(() => uploading.delete(owner)))',
    'Effect.ensuring(Effect.void)',
  ),
  edit('inspect is skipped', 'yield* inspect(bytes, declared)\n', ''),
  edit(
    'a too-slow body is a defect',
    "BodyTooSlow: () => Effect.succeed(refused(408, 'TooSlow')),",
    "BodyTooSlow: () => Effect.die('slow'),",
  ),
  edit(
    'a limited upload says no retry time',
    "'retry-after': String(retryAfterSeconds)",
    "'x-retry': String(retryAfterSeconds)",
  ),
  edit(
    'an upload answer may be kept',
    "'cache-control': 'no-store', 'x-content",
    "'cache-control': 'private', 'x-content",
  ),
  edit('any key is looked up', 'if (!isFileKey(params.key)) return notFound', ''),
  edit(
    'anyone may read',
    'if (!(yield* mayRead(params.key))) return notFound',
    'yield* mayRead(params.key)',
  ),
  edit(
    'the store is read before the policy',
    'const mayRead = yield* readPolicy.resolve(request)',
    'yield* files.read(params.key)\n            const mayRead = yield* readPolicy.resolve(request)',
  ),
  edit(
    'a refusal of a read says the file is there',
    'if (!(yield* mayRead(params.key))) return notFound',
    'if (!(yield* mayRead(params.key))) return unauthenticated',
  ),
  edit(
    'an unknown asker is a 404',
    "Effect.catchTag('FileUnauthenticated', () => Effect.succeed(unauthenticated))",
    "Effect.catchTag('FileUnauthenticated', () => Effect.succeed(notFound))",
  ),
  edit(
    'a refusal carries no download headers',
    'const notFound = HttpServerResponse.empty({ status: 404, headers: fileHeaders(Option.none()) })',
    'const notFound = HttpServerResponse.empty({ status: 404 })',
  ),
  edit(
    'a download is named by its query',
    'headers: fileHeaders(Option.some(asset.name))',
    "headers: fileHeaders(Option.some(new URL(request.url, 'http://x').searchParams.get('name') ?? asset.name))",
  ),
]
