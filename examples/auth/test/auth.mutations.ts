/**
 * The example's own claims, each broken in turn: `pnpm mutate
 * examples/auth/test/auth.mutations.ts`. What only a page shows (the
 * broadcast heard, the drawn lines) is `e2e/auth.e2e.ts`'s.
 */
const server = ['examples/auth/test/server.test.ts']
const app = ['examples/auth/test/app.test.ts']

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
]
