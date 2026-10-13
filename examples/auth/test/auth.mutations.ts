/**
 * The example's own claims, each broken in turn: `pnpm mutate
 * examples/auth/test/auth.mutations.ts`. What only a page shows (the
 * broadcast heard, the drawn lines, a redirect followed) is
 * `e2e/auth.e2e.ts`'s.
 */
const server = ['examples/auth/test/server.test.ts']
const app = ['examples/auth/test/app.test.ts']
const page = ['examples/auth/test/page.test.ts']

export default [
  {
    name: 'a member is taken for an admin',
    edits: [
      {
        file: '../src/server.ts',
        find: "Option.exists(principal, user => user.role === 'admin')",
        replace: "Option.exists(principal, user => user.role === 'member')",
      },
    ],
    tests: server,
  },
  {
    name: 'an admin reads only their own notes',
    edits: [
      {
        file: '../src/domain.ts',
        find: 'row: { Read: [G.isAuthor, G.isAdmin] }',
        replace: 'row: { Read: [G.isAuthor] }',
      },
    ],
    tests: server,
  },
  {
    name: 'an author is matched by role, not id',
    edits: [
      {
        file: '../src/domain.ts',
        find: 'Expr.eq(NoteFields.fields.authorId, p.id)',
        replace: 'Expr.eq(NoteFields.fields.authorId, p.role)',
      },
    ],
    tests: server,
  },
  {
    name: 'Me answers no interaction',
    edits: [
      {
        file: '../src/domain.ts',
        find: 'Guards.me(G, { interactions: { [OpenAdmin.key]: [G.isAdmin] } })',
        replace: 'Guards.me(G, {})',
      },
    ],
    tests: server,
  },
  {
    name: 'every session is answered as the first account',
    edits: [
      {
        file: '../src/server.ts',
        find: 'onSome: account => Effect.succeed<User>(account.user)',
        replace: 'onSome: () => Effect.succeed<User>(accounts[0].user)',
      },
    ],
    tests: server,
  },
  {
    name: "Yielded's routes are never reached",
    edits: [
      {
        file: '../src/http.ts',
        find: "path.startsWith('/auth/')",
        replace: "path.startsWith('/nowhere/')",
      },
    ],
    tests: server,
  },
  {
    name: 'only the last Set-Cookie of an answer is sent',
    edits: [
      {
        file: '../src/http.ts',
        find: "    'set-cookie': answered.headers.getSetCookie(),\n",
        replace: '',
      },
    ],
    tests: server,
    survives:
      'Password sign-in and sign-out each set one cookie; a multi-step method sets its flow cookie beside the session, which this example does not offer.',
  },
  {
    name: 'a change of principal here keeps what was read',
    edits: [
      {
        file: '../src/app.ts',
        find: "model: Data.forget(modifyFields(model, { password: () => '', notice: () => Option.none() })),",
        replace: "model: modifyFields(model, { password: () => '', notice: () => Option.none() }),",
      },
    ],
    tests: app,
  },
  {
    name: 'a change of principal here keeps the password',
    edits: [
      {
        file: '../src/app.ts',
        find: "{ password: () => '', notice: () => Option.none() }",
        replace: '{ notice: () => Option.none() }',
      },
    ],
    tests: app,
  },
  {
    name: 'a change of principal here tells no other tab',
    edits: [{ file: '../src/app.ts', find: 'commands: [announce()],', replace: 'commands: [],' }],
    tests: app,
  },
  {
    name: "another tab's change is not heard",
    edits: [
      {
        file: '../src/app.ts',
        find: 'model: data === TAB ? model : Data.forget(model)',
        replace: 'model',
      },
    ],
    tests: app,
  },
  {
    name: "this tab's own post forgets again",
    edits: [
      {
        file: '../src/app.ts',
        find: 'Posted: () => ({ model }),',
        replace: 'Posted: () => ({ model: Data.forget(model) }),',
      },
    ],
    tests: app,
  },
  {
    name: 'the password typed is not the one sent',
    edits: [
      {
        file: '../src/app.ts',
        find: 'SignIn({ email: model.email, password: Redacted.make(model.password) })',
        replace: 'SignIn({ email: model.email, password: Redacted.make(model.email) })',
      },
    ],
    tests: app,
  },
  {
    name: 'a refusal for a changed subject is only shown',
    edits: [
      {
        file: '../src/app.ts',
        find: 'changedElsewhere(message) ? { model: Data.forget(model) } : foldData(model, message)',
        replace: 'foldData(model, message)',
      },
    ],
    tests: app,
  },
  {
    name: 'a failed query is never a changed subject',
    edits: [
      {
        file: '../src/app.ts',
        find: '    QueryFailed: ({ error }) => isSubjectChanged(error),\n',
        replace: '',
      },
    ],
    tests: app,
  },
  {
    name: 'every refusal forgets',
    edits: [
      {
        file: '../src/app.ts',
        find: 'Option.contains(refusal.reason, SUBJECT_CHANGED)',
        replace: 'Option.isSome(Option.some(refusal))',
      },
    ],
    tests: app,
  },
  {
    name: "this tab's own post makes it forget again",
    edits: [
      {
        file: '../src/app.ts',
        find: 'model: data === TAB ? model : Data.forget(model)',
        replace: 'model: Data.forget(model)',
      },
    ],
    tests: app,
  },
  {
    name: 'a broadcast that failed says nothing',
    edits: [
      {
        file: '../src/app.ts',
        find: 'model: noticed(model, `Other tabs were not told: ${message}`),',
        replace: 'model: message === undefined ? noticed(model, message) : model,',
      },
    ],
    tests: app,
  },
  {
    name: 'a change of principal keeps the last notice',
    edits: [
      {
        file: '../src/app.ts',
        find: "password: () => '', notice: () => Option.none()",
        replace: "password: () => ''",
      },
    ],
    tests: app,
  },
  {
    name: 'a failed sign-out keeps what was read',
    edits: [
      {
        file: '../src/app.ts',
        find: 'model: Data.forget(noticed(model, reason))',
        replace: 'model: noticed(model, reason)',
      },
    ],
    tests: app,
  },
  {
    name: 'a page never sends away a reader it refuses',
    edits: [
      {
        file: '../src/app.ts',
        find: 'guarded(model, routed(model, message))',
        replace: 'routed(model, message)',
      },
    ],
    tests: app,
  },
  {
    name: 'a refusal is sent again on every Message until the address changes',
    edits: [
      {
        file: '../src/app.ts',
        find: 'Option.contains(deniedUrl(before), url)',
        replace: 'Option.isNone(Option.some(url))',
      },
    ],
    tests: app,
  },
  {
    name: 'a reader not yet read is taken for a visitor',
    edits: [
      {
        file: '../src/app.ts',
        find: 'Initial: () => Option.none(),',
        replace: 'Initial: () => Option.some(nobody),',
      },
    ],
    tests: app,
  },
  {
    name: 'a reader whose Me failed is waited on for ever',
    edits: [
      {
        file: '../src/app.ts',
        find: 'Failed: () => Option.some(nobody),',
        replace: 'Failed: () => Option.none(),',
      },
    ],
    tests: app,
  },
  {
    name: 'the notes let anyone in',
    edits: [
      {
        file: '../src/app.ts',
        find: 'allow: reader => reader.signedIn,',
        replace: 'allow: () => true,',
      },
    ],
    tests: [...app, ...page],
  },
  {
    name: 'a sign-in goes nowhere after',
    edits: [
      {
        file: '../src/app.ts',
        find: '...(changed.commands ?? []), ...returning(model.route)',
        replace: '...(changed.commands ?? [])',
      },
    ],
    tests: app,
  },
  {
    name: 'a sign-in goes on to another host',
    edits: [
      {
        file: '../src/app.ts',
        find: '/^\\/(?![/\\\\])/',
        replace: '/^\\//',
      },
    ],
    tests: app,
  },
  {
    name: 'the host renders a page that refuses its reader',
    edits: [
      {
        file: '../src/page.ts',
        find: 'Access.match(accessOf(model), {',
        replace: 'Access.match(Access.Allowed(), {',
      },
    ],
    tests: page,
  },
  {
    name: 'the host reads as no one',
    edits: [
      {
        file: '../src/page.ts',
        find: '      ...(cookie === null ? {} : { cookie }),\n',
        replace: '',
      },
    ],
    tests: page,
  },
  {
    name: "the host's reads leave out Yielded's CSRF header",
    edits: [{ file: '../src/page.ts', find: "      'x-effect-auth-csrf': '1',\n", replace: '' }],
    tests: page,
  },
  {
    name: 'the host reads for every method',
    edits: [
      {
        file: '../src/page.ts',
        find: "if (method !== 'GET' && method !== 'HEAD') return entryFor(initial).renderPage(request)",
        replace: '',
      },
    ],
    tests: page,
  },
  {
    name: 'a session that ended fails the page',
    edits: [
      {
        file: '../src/page.ts',
        find: "    Effect.catchTag('Unauthenticated', () => Effect.succeed(unread)),\n",
        replace: '',
      },
    ],
    tests: page,
  },
  {
    name: 'a page may be kept by a shared cache',
    edits: [
      {
        file: '../src/page.ts',
        find: "const pageHeaders = { 'cache-control': 'private, no-store', vary: 'cookie' }",
        replace: "const pageHeaders = { 'cache-control': 'public' }",
      },
    ],
    tests: page,
  },
]
