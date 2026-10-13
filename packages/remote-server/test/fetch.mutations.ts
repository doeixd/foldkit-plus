/**
 * `serveFetch`, each guard broken in turn: `pnpm mutate
 * packages/remote-server/test/fetch.mutations.ts` checks that a test fails for every one.
 */
const tests = ['packages/remote-server/test/fetch.test.ts']
const file = '../src/fetch.ts'

export default [
  {
    name: 'every method and path is answered',
    edits: [
      {
        file,
        find: "if (request.method !== 'POST' || new URL(request.url).pathname !== path) {",
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'the default path is wrong',
    edits: [{ file, find: "?? '/remote'", replace: "?? '/other'" }],
    tests,
  },
  {
    name: 'a body that is not JSON is answered 200',
    edits: [
      {
        file,
        find: "{ error: 'The body is not JSON' }, { status: 400 }",
        replace: "{ error: 'The body is not JSON' }, { status: 200 }",
      },
    ],
    tests,
  },
  {
    name: 'a refused principal is a 500',
    edits: [{ file: '../src/refusal.ts', find: 'status: 401,', replace: 'status: 500,' }],
    tests,
  },
  {
    name: 'unauthenticated drops its reason',
    edits: [
      {
        file: '../src/index.ts',
        find: "message: reason ?? 'Unauthenticated',\n      ...(reason === undefined ? {} : { reason }),",
        replace: "message: reason ?? 'Unauthenticated',",
      },
    ],
    tests,
  },
  {
    name: 'a refusal is not caught',
    edits: [
      {
        file,
        find: 'return Effect.succeed({ response: Response.json(body, { status }), live: false })',
        replace: 'return Effect.die(body)',
      },
    ],
    tests,
  },
  {
    name: 'every request answers as no principal',
    edits: [
      {
        file,
        find: 'const handlers = RemoteServer.handlers(config.server, principal, {',
        replace: 'const handlers = RemoteServer.handlers(config.server, undefined as P, {',
      },
    ],
    tests,
  },
  {
    name: 'the environment never reaches the layer',
    edits: [
      {
        file,
        find: 'Layer.buildWithScope(config.layer(env), scope)',
        replace: 'Layer.buildWithScope(config.layer({} as Env), scope)',
      },
    ],
    tests,
  },
  {
    name: 'a broken layer leaks its message',
    edits: [
      {
        file,
        find: "// failures and defects to 400/500 answers.\n      return Response.json({ error: 'Internal error' }, { status: 500 })",
        replace:
          "// failures and defects to 400/500 answers.\n      return Response.json({ error: 'leaked' }, { status: 500 })",
      },
    ],
    tests,
  },
]
