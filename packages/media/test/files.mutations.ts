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
  edit('a trickle passes after one full window', '          inWindow = 0\n', ''),
  edit(
    "an owner's mark is kept after a failure",
    'Effect.ensuring(Effect.sync(() => uploading.delete(owner)))',
    'Effect.tap(() => Effect.sync(() => uploading.delete(owner)))',
  ),
  {
    name: 'a file is kept before its name is checked',
    edits: [
      {
        file: files,
        find: "            const name = fileNameOf(request.headers['x-foldkit-file-name'])\n",
        replace:
          "            yield* files.keep(new Uint8Array(1), { name: 'x', type: 'x', owner })\n            const name = fileNameOf(request.headers['x-foldkit-file-name'])\n",
      },
    ],
    tests,
  },
  {
    name: 'a file is kept before inspect',
    edits: [
      {
        file: files,
        find: '                yield* inspect(bytes, declared)\n                return yield* files.keep(bytes, { ...declared, owner })',
        replace:
          '                const asset = yield* files.keep(bytes, { ...declared, owner })\n                yield* inspect(bytes, declared)\n                return asset',
      },
    ],
    tests,
  },
  {
    name: 'serveFetch mounts no file route',
    edits: [
      {
        file: '../src/server/fetch.ts',
        find: ': fileLayer(files).pipe(Layer.provideMerge(files.layer(env))),',
        replace: ': Layer.empty,',
      },
    ],
    tests,
  },
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
