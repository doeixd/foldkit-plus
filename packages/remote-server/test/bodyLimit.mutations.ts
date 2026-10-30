/**
 * Request body limits (#359), broken in turn:
 * `pnpm mutate packages/remote-server/test/bodyLimit.mutations.ts`.
 */
const body = '../src/body.ts'
const fetch = '../src/fetch.ts'
const tests = ['packages/remote-server/test/bodyLimit.test.ts']

export default [
  {
    name: 'serveFetch builds the layer and asks the principal before refusing by length',
    edits: [
      {
        file: fetch,
        find: 'if (declaresTooLarge(request, maxBodyBytes)) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'serveFetch takes any body by default',
    edits: [
      {
        file: fetch,
        find: 'config.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES',
        replace: 'config.maxBodyBytes ?? Infinity',
      },
    ],
    tests,
  },
  {
    name: 'a body is read before its length is looked at',
    edits: [
      {
        file: body,
        find: '  if (declaresTooLarge(request, limit)) throw new BodyTooLarge()\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a body with no length is read whole',
    edits: [{ file: body, find: 'if (total > limit) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'a body past the limit is left streaming',
    edits: [{ file: body, find: '      await reader.cancel()\n', replace: '' }],
    tests,
  },
  {
    name: 'bytes that are not UTF-8 are decoded anyway',
    edits: [
      {
        file: body,
        find: "new TextDecoder('utf-8', { fatal: true })",
        replace: "new TextDecoder('utf-8')",
      },
    ],
    tests,
  },
  {
    name: 'bodyLimit hands the endpoint a request whose body it already read',
    edits: [
      {
        file: body,
        find: 'HttpServerRequest.fromWeb(new Request(web, { body: bytes })),',
        replace: 'request,',
      },
    ],
    tests,
  },
  {
    name: 'Remote.http reads a gateway’s 413 as unreachable, so a mutation is resent',
    edits: [
      {
        file: '../../remote/src/json.ts',
        find: "    if (response.status === 413) return refusalOf(body, 'tooLarge', status)\n",
        replace: '',
      },
    ],
    tests,
  },
]
