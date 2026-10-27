/**
 * A Yielded session read as Remote's principal, broken in turn:
 * `pnpm mutate packages/auth/test/server.mutations.ts`.
 */
const file = '../src/server.ts'
const index = '../src/index.ts'
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
    name: 'a missing Origin is refused from its own site',
    edits: [{ file, find: "origin === null || origin === 'null'", replace: "origin === 'null'" }],
    tests,
  },
  {
    name: 'an opaque Origin is read as written',
    edits: [{ file, find: "origin === null || origin === 'null'", replace: 'origin === null' }],
    tests,
  },
  {
    name: 'Sec-Fetch-Site overrules an Origin',
    edits: [
      {
        file,
        find: "origin === null || origin === 'null'",
        replace:
          "origin === null || origin === 'null' || request.headers.get('sec-fetch-site') === 'same-origin'",
      },
    ],
    tests,
  },
  {
    name: 'a sibling site counts as the site',
    edits: [
      {
        file,
        find: "request.headers.get('sec-fetch-site') === 'same-origin'",
        replace: "request.headers.get('sec-fetch-site') !== 'cross-site'",
      },
    ],
    tests,
  },
  {
    name: 'a key is not what the client is compared by',
    edits: [
      {
        file,
        find: 'yield* checkBelieved(request, Option.some(key(user)))',
        replace: 'yield* checkBelieved(request, Option.some(session.subjectId))',
      },
    ],
    tests,
  },
  {
    name: 'a 401 keeps the belief',
    edits: [
      {
        file: index,
        find: '      if (response.status === 401) {\n        believed = Option.none()',
        replace: '      if (response.status === 401) {\n        void 0',
      },
    ],
    tests,
  },
  {
    name: 'the belief is never sent',
    edits: [
      { file: index, find: 'headers.set(SUBJECT_HEADER, believed.value)', replace: 'void 0' },
    ],
    tests,
  },
  {
    name: "a caller's own header is overwritten",
    edits: [{ file: index, find: ' && !headers.has(SUBJECT_HEADER)', replace: '' }],
    tests,
  },
  {
    name: 'an answer that says nothing forgets',
    edits: [
      {
        file: index,
        find: '} else if (said !== null && asked === epoch) believed = Option.some(said)',
        replace:
          '} else if (asked === epoch) believed = said === null ? Option.none() : Option.some(said)',
      },
    ],
    tests,
  },
  {
    name: 'forget forgets nothing',
    edits: [
      {
        file: index,
        find: '    forget: () => {\n      believed = Option.none()',
        replace: '    forget: () => {\n      void believed',
      },
    ],
    tests,
  },
  {
    name: "a Request's own headers are dropped",
    edits: [
      {
        file: index,
        find: 'init?.headers ?? (input instanceof Request ? input.headers : {})',
        replace: 'init?.headers',
      },
    ],
    tests,
  },
  {
    name: 'the answer names someone other than the key',
    edits: [
      {
        file,
        find: 'Option.map(principal, config.key)',
        replace: "Option.map(principal, () => 'x')",
      },
    ],
    tests,
  },
  {
    name: 'a changed subject is refused for another reason',
    edits: [{ file, find: 'refuse(SUBJECT_CHANGED)', replace: "refuse('changed')" }],
    tests,
  },
  {
    name: 'an answer to a stale request is believed',
    edits: [{ file: index, find: ' && asked === epoch', replace: '' }],
    tests,
  },
  {
    name: 'forget leaves the epoch where it was',
    edits: [
      {
        file: index,
        find: '      believed = Option.none()\n      epoch += 1\n    },',
        replace: '      believed = Option.none()\n    },',
      },
    ],
    tests,
  },
  {
    name: 'a 401 leaves the epoch where it was',
    edits: [
      {
        file: index,
        find: '        believed = Option.none()\n        epoch += 1\n      } else',
        replace: '        believed = Option.none()\n      } else',
      },
    ],
    tests,
  },
  {
    name: 'the subject is sent as it is',
    edits: [
      { file: index, find: '`subject:${encodeURIComponent(id)}`', replace: '`subject:${id}`' },
    ],
    tests,
  },
  {
    name: 'a navigation must show it came from the application',
    edits: [{ file, find: "    config.requests === 'navigation'\n", replace: '    false\n' }],
    tests,
  },
  {
    name: "a navigation's cookie is read on any method",
    edits: [
      {
        file,
        find: "      ? request.method === 'GET' || request.method === 'HEAD'\n",
        replace: '      ? true\n',
      },
    ],
    tests,
  },
  {
    name: 'a navigation is read on GET alone',
    edits: [
      {
        file,
        find: "request.method === 'GET' || request.method === 'HEAD'",
        replace: "request.method === 'GET'",
      },
    ],
    tests,
  },
]
