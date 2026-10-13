/**
 * A Yielded session read as Remote's principal, broken in turn:
 * `pnpm mutate packages/auth/test/server.mutations.ts`.
 */
const file = '../src/server.ts'
const tests = ['packages/auth/test/server.test.ts']

export default [
  {
    name: 'two session cookies read as the first',
    edits: [
      {
        file,
        find: "if (credentials.length > 1) return yield* refuse('Sign in again.')",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a cookie is read from any Origin',
    edits: [{ file, find: 'cameFrom(request, trusted) &&', replace: '' }],
    tests,
  },
  {
    name: 'a cookie is read without the CSRF header',
    edits: [
      {
        file,
        find: "(config.requests === 'browser' || request.headers.get(csrf.header) === csrf.value)",
        replace: 'true',
      },
    ],
    tests,
  },
  {
    name: 'a cookie from a request that did not show its origin is a visitor',
    edits: [
      {
        file,
        find: "return yield* refuse('The request did not show it came from this application.')",
        replace: 'return yield* asVisitor(request)',
      },
    ],
    tests,
  },
  {
    name: 'only the application’s own origin is trusted',
    edits: [{ file, find: '...(config.http.trustedOrigins ?? [])', replace: '' }],
    tests,
  },
  {
    name: 'a CSRF header of its own is ignored',
    edits: [{ file, find: 'config.http.csrf ??', replace: '' }],
    tests,
  },
  {
    name: 'any origin is trusted as written',
    edits: [{ file, find: 'new URL(origin).origin !== origin', replace: 'false' }],
    tests,
  },
  {
    name: 'a session that no longer verifies is a defect',
    edits: [
      {
        file,
        find: "Effect.catchTag('SessionInvalid', () => refuse('Your session ended.')),",
        replace: "Effect.catchTag('SessionInvalid', () => Effect.die('ended')),",
      },
    ],
    tests,
  },
  {
    name: 'a session store that fails reads as a refusal',
    edits: [{ file, find: 'Effect.die,', replace: "() => refuse('Your session ended.')," }],
    tests,
  },
  {
    name: 'what a signed-in client believes is not checked',
    edits: [
      { file, find: 'yield* checkBelieved(request, Option.some(session.subjectId))', replace: '' },
    ],
    tests,
  },
  {
    name: 'what a visitor believes is not checked',
    edits: [
      {
        file,
        find: 'Effect.as(checkBelieved(request, Option.none()), Option.none())',
        replace: 'Effect.succeed(Option.none())',
      },
    ],
    tests,
  },
  {
    name: 'the session is not the principal',
    edits: [
      {
        file,
        find: 'return Option.some(yield* config.principal(session))',
        replace: 'return Option.some(session.subjectId as never)',
      },
    ],
    tests,
  },
  {
    name: 'the cookie is named without its prefix',
    edits: [{ file, find: "'__Host-' : '__Secure-'", replace: "'' : ''" }],
    tests,
  },
  {
    name: 'a cookie name of its own is ignored',
    edits: [
      { file, find: 'if (http.cookie?.name !== undefined) return http.cookie.name', replace: '' },
    ],
    tests,
  },
  {
    name: 'a cookie prefix of its own is ignored',
    edits: [{ file, find: 'http.cookie?.prefix ??', replace: '' }],
    tests,
  },
  {
    name: 'an insecure cookie keeps the secure prefix',
    edits: [
      { file, find: 'const secure = http.cookie?.secure ?? true', replace: 'const secure = true' },
    ],
    tests,
  },
  {
    name: 'a browser request must send the CSRF header it cannot',
    edits: [{ file, find: "(config.requests === 'browser' || ", replace: '(' }],
    tests,
  },
  {
    name: 'Origin: null is looked up as an origin',
    edits: [{ file, find: "origin !== null && origin !== 'null'", replace: 'origin !== null' }],
    tests,
  },
  {
    name: 'a withheld Origin is taken from anywhere but another site',
    edits: [
      {
        file,
        find: "request.headers.get('sec-fetch-site') === 'same-origin'",
        replace: "request.headers.get('sec-fetch-site') !== 'cross-site'",
      },
    ],
    tests,
  },
]
