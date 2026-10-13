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
    edits: [{ file, find: "trusted.has(request.headers.get('origin') ?? '') &&", replace: '' }],
    tests,
  },
  {
    name: 'a cookie is read without the CSRF header',
    edits: [
      { file, find: '&&\n          request.headers.get(csrf.header) === csrf.value', replace: '' },
    ],
    tests,
  },
  {
    name: 'a session that no longer verifies is a visitor',
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
    name: 'what the client believes is not checked',
    edits: [{ file, find: 'believed !== null &&', replace: 'false &&' }],
    tests,
  },
  {
    name: 'a refusal never says the origin was missing',
    edits: [{ file, find: 'credentials.length > 0 && !fromApplication', replace: 'false' }],
    tests,
  },
  {
    name: 'the session is not the principal',
    edits: [
      {
        file,
        find: 'onSome: verified => Effect.map(config.principal(verified), Option.some),',
        replace: 'onSome: () => Effect.succeed(Option.none<User>()),',
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
    name: 'a session store that fails reads as a visitor',
    edits: [{ file, find: 'Effect.die,', replace: '() => Effect.succeed(Option.none<S>()),' }],
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
]
