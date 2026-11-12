/**
 * The browser upload client, broken in turn:
 * `pnpm mutate packages/media/test/browserUpload.mutations.ts` checks that a
 * test fails for every one.
 */
const file = '../src/browser/upload.ts'
const tests = ['packages/media/test/upload.browser.test.ts']

const one = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  one('no progress', 'request.upload.onprogress = event =>', 'request.onprogress = event =>'),
  one('headers dropped', 'request.setRequestHeader(name, value)', 'void [name, value]'),
  one('another route by default', "options.url ?? '/_media/upload'", "options.url ?? '/upload'"),
  one('any status is success', 'if (request.status !== 201)', 'if (request.status >= 400)'),
  one('every refusal is unexpected', "refusals[request.status] ?? 'Unexpected'", "'Unexpected'"),
  one(
    'any body is facts',
    'return Schema.decodeUnknownOption(schema)(JSON.parse(body))',
    'return Option.some(JSON.parse(body))',
  ),
  one('success never ends', '              Queue.endUnsafe(queue)\n', ''),
  one('a network failure is unexpected', "fail('Network')", "fail('Unexpected')"),
  one('interrupting keeps the request', 'Effect.sync(() => request.abort())', 'Effect.void'),
  one(
    'progress is said only at the end',
    'request.upload.onprogress = event =>',
    'request.upload.onloadend = event =>',
  ),
  one('progress says it is done at once', 'loaded: event.loaded,', 'loaded: body.size,'),
  one(
    'a file is sent typed by itself',
    "'content-type': 'application/octet-stream',\n            'x-foldkit",
    "'x-foldkit",
  ),
  one(
    'a name is sent unencoded',
    'Option.liftThrowable(encodeURIComponent)(file.name)',
    'Option.some(file.name)',
  ),
  one(
    'a file with no type declares none',
    "file.type === '' ? 'application/octet-stream' : file.type",
    'file.type',
  ),
  one(
    'a file goes to the image route',
    "options.url ?? '/_media/files'",
    "options.url ?? '/_media/upload'",
  ),
  one('a file answer is read as an image', 'fileFactsOf,', 'imageFactsOf as never,'),
  one('a slow body is unexpected', "  408: 'TooSlow',\n", ''),
  one('a busy route is unexpected', "  503: 'Busy',\n", ''),
  one('a rate limit is unexpected', "  429: 'RateLimited',\n", ''),
  {
    name: 'a file name encodeURIComponent refuses throws instead of failing the stream',
    edits: [
      {
        file,
        find: 'Option.liftThrowable(encodeURIComponent)(file.name)',
        replace: 'Option.some(encodeURIComponent(file.name))',
      },
    ],
    tests: ['packages/media/test/uploadName.test.ts'],
  },
]
