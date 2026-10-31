/**
 * The reference app, broken one piece at a time:
 * `pnpm mutate examples/reference/test/reference.mutations.ts`
 *
 * `notebook.test.ts` runs `update` over the real server in Node; the Worker's
 * tests run the bundle `stack.ts` builds with these edits applied
 * (`mutation.ts`); `migrations.test.ts` holds the migrations to the code.
 */
const page = ['examples/reference/test/notebook.test.ts']
const worker = ['examples/reference/test/worker.test.ts']
const migrations = ['examples/reference/test/migrations.test.ts']

export default [
  {
    name: 'a note only its add holds is asked of the server',
    edits: [
      {
        file: '../../../packages/remote/src/index.ts',
        find: '!held.has(entityKey(requirement.entity, requirement.id))',
        replace: 'true',
      },
    ],
    tests: page,
  },
  {
    name: 'a new note joins no list until it is answered',
    edits: [
      {
        file: '../../../packages/remote/src/placing.ts',
        find: 'if (!holds.has(entityKey(change.entity, change.id)) && !created) continue',
        replace: 'if (!holds.has(entityKey(change.entity, change.id))) continue',
      },
    ],
    tests: page,
  },
  {
    name: 'a refused note stays in the list',
    edits: [
      {
        file: '../../../packages/remote/src/optimistic.ts',
        find: 'requestId: string): OptimisticState =>\n  release(optimistic, requestId)',
        replace: 'requestId: string): OptimisticState =>\n  optimistic',
      },
    ],
    tests: page,
  },
  {
    name: 'a new note points at no author',
    edits: [
      {
        file: '../src/domain.ts',
        find: '{ author: Expr.viewer(MemberFields), createdAt: Expr.now }',
        replace: '{ createdAt: Expr.now }',
      },
    ],
    tests: page,
  },
  {
    name: 'a sign-in goes on to another site',
    edits: [
      { file: '../src/main.ts', find: 'return parsed.origin === HERE', replace: 'return true' },
    ],
    tests: page,
  },
  {
    name: 'a visitor may see the notebook',
    edits: [
      {
        file: '../src/main.ts',
        find: 'allow: reader => reader.signedIn,',
        replace: 'allow: () => true,',
      },
    ],
    tests: [...page, ...worker],
  },
  {
    name: 'a member stays on the sign-in page',
    edits: [
      {
        file: '../src/main.ts',
        find: 'reader.signedIn ? Access.Denied({ url: notebookHref }) : Access.Allowed(),',
        replace: 'Access.Allowed(),',
      },
    ],
    tests: [...page, ...worker],
  },
  {
    name: 'anyone is the author',
    edits: [
      {
        file: '../src/guard.ts',
        find: 'p => Expr.eq(Notebook.Note.relations.author, p.id)',
        replace: 'p => Expr.eq(Notebook.Note.relations.author, Notebook.Note.relations.author)',
      },
    ],
    tests: worker,
  },
  {
    name: 'a refused page is rendered',
    edits: [
      {
        file: '../src/page.ts',
        find: 'new Response(null, { status: 303, headers: { location: url, ...pageHeaders } }),',
        replace: 'new Response(null, { status: 200, headers: pageHeaders }),',
      },
    ],
    tests: worker,
  },
  {
    name: "a page is read as a script's request, so a member's is a visitor's",
    edits: [
      {
        file: '../src/worker.ts',
        find: "resolvePrincipal: AuthServer.resolver({ ...resolving, requests: 'navigation' }),",
        replace: 'resolvePrincipal: AuthServer.resolver(resolving),',
      },
    ],
    tests: worker,
  },
  {
    name: 'the Worker renders under a build id of its own',
    edits: [
      {
        file: '../src/build.ts',
        find: 'Option.fromUndefinedOr(pattern.exec(template)?.[1])',
        replace: "Option.some('not-this-build')",
      },
    ],
    tests: worker,
  },
  {
    name: 'an empty title is allowed',
    edits: [
      {
        file: '../src/domain.ts',
        find: 'Schema.isMinLength(1), Schema.isMaxCodePoints(120)',
        replace: 'Schema.isMaxCodePoints(120)',
      },
    ],
    tests: [...migrations, ...worker],
  },
  {
    name: 'a body may be as long as anyone likes',
    edits: [
      {
        file: '../src/domain.ts',
        find: 'Schema.String.check(Schema.isMaxCodePoints(2000))',
        replace: 'Schema.String',
      },
    ],
    tests: migrations,
  },
  {
    name: 'a note is added with no time',
    edits: [
      {
        file: '../src/main.ts',
        find: 'Data.mutate(model, AddNote, { id, title, body }, { now })',
        replace: 'Data.mutate(model, AddNote, { id, title, body })',
      },
    ],
    tests: page,
  },
  {
    name: 'the notes writer keeps no ledger',
    edits: [
      {
        file: '../src/server.ts',
        find: 'writer(Db.Note, {\n    ledger: {',
        replace: 'writer(Db.Note, {\n    unread: {',
      },
    ],
    tests: worker,
  },
  {
    name: 'D1 is taken for a database with transactions, which refuses every ledgered write',
    edits: [
      {
        file: '../../../packages/remote-drizzle/src/index.ts',
        find: "] === 'D1Database'",
        replace: "] === 'none'",
      },
    ],
    tests: worker,
  },
  {
    name: 'a copy that lost the race on workerd is answered with its failure',
    edits: [
      {
        file: '../../../packages/remote-drizzle/src/index.ts',
        find: 'if (Option.isSome(after)) return after.value',
        replace: '',
      },
    ],
    tests: worker,
  },
  {
    name: 'a live re-read may read no field',
    edits: [
      {
        file: '../../../packages/remote-server/src/index.ts',
        find: 'const allowed = allowedFields(source, principal, context.fields)',
        replace: 'const allowed: ReadonlyArray<string> = []',
      },
    ],
    tests: worker,
  },
  {
    name: 'each request is checked against the host it arrived at',
    edits: [
      {
        file: '../src/worker.ts',
        find: 'const host = await hostOf(env, env.ORIGIN)',
        replace: 'const host = await hostOf(env, url.origin)',
      },
    ],
    tests: worker,
  },
  {
    name: 'a Worker with no ORIGIN answers as if it had one',
    edits: [
      {
        file: '../src/worker.ts',
        find: "    if (env.ORIGIN === undefined)\n      return new Response('Set ORIGIN to where this Worker is served.', { status: 500 })\n",
        replace: '',
      },
    ],
    tests: worker,
  },
  {
    name: 'the ledger has no index on its time',
    edits: [
      { file: '../src/server.ts', find: "index('write_ledger_at').on(table.at),", replace: '' },
    ],
    tests: migrations,
  },
  {
    name: 'a failed write is named by its descriptor, not its name',
    edits: [
      {
        file: '../src/view.ts',
        find: '`${failed.mutation.name} failed: ${failed.error.message}`',
        replace: '`${String(failed.mutation)} failed: ${failed.error.message}`',
      },
    ],
    tests: page,
  },
  {
    name: 'a write nothing answered reads as any failure',
    edits: [
      {
        file: '../src/view.ts',
        find: 'RemoteData.isUnreachable(failed.error)',
        replace: 'false',
      },
    ],
    tests: page,
  },
]
