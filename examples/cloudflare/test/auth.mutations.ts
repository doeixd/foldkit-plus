/**
 * Yielded Auth on D1, broken one piece at a time:
 * `pnpm mutate examples/cloudflare/test/auth.mutations.ts`
 *
 * `auth.test.ts` runs the worker esbuild bundles, which `stack.ts` builds
 * with these edits applied; `migrations.test.ts` reads the tables through Vite.
 */
const worker = ['examples/cloudflare/test/auth.test.ts']
const migration = ['examples/cloudflare/test/migrations.test.ts']

export default [
  {
    name: 'sign-up provisions a row without the name it was given',
    edits: [
      {
        file: '../src/auth.ts',
        find: 'displayName: registration.displayName,',
        replace: "displayName: 'someone',",
      },
    ],
    tests: worker,
  },
  {
    name: '/me answers everyone as a visitor',
    edits: [
      {
        file: '../src/authRoutes.ts',
        find: 'json(200, { account: Option.getOrNull(account) })',
        replace: 'json(200, { account: null })',
      },
    ],
    tests: worker,
  },
  {
    name: '/me answers a refused cookie as a failure of its own',
    edits: [
      {
        file: '../src/authRoutes.ts',
        find: 'json(401, { error: refused.reason })',
        replace: 'json(500, { error: refused.reason })',
      },
    ],
    tests: worker,
  },
  {
    name: '/me is sent to Yielded’s routes',
    edits: [
      {
        file: '../src/worker.ts',
        find: "return pathname === '/me' ? routes.me(request) : routes.auth(request)",
        replace: 'return routes.auth(request)',
      },
    ],
    tests: worker,
  },
  {
    name: 'the account is read for someone other than the session',
    edits: [
      {
        file: '../src/authRoutes.ts',
        find: '.bind(session.subjectId)',
        replace: ".bind('nobody')",
      },
    ],
    tests: worker,
  },
  {
    name: 'Yielded’s tables are named apart from the migration',
    edits: [{ file: '../src/auth.ts', find: "prefix: 'auth',", replace: "prefix: 'yielded'," }],
    tests: [...migration, ...worker],
  },
  {
    name: 'an account’s email may be missing',
    edits: [
      {
        file: '../src/auth.ts',
        find: "email: text('email').notNull(),",
        replace: "email: text('email'),",
      },
    ],
    tests: migration,
  },
]
