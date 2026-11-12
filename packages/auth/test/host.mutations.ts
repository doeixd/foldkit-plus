/**
 * `AuthServer.host`, broken in turn:
 * `pnpm mutate packages/auth/test/host.mutations.ts`. Its typing (a
 * navigation resolver refused by `serveFetch`, a scripted one by
 * `pageReader`) is held by `types.test-d.ts`, which `pnpm mutate` does not run.
 */
const file = '../src/server.ts'
const tests = ['packages/auth/test/server.test.ts']

export default [
  {
    name: 'the routes are mounted with options of their own',
    edits: [
      {
        file,
        find: 'Http.make(config.auth, config.http)',
        replace: 'Http.make(config.auth, { origin: config.http.origin })',
      },
    ],
    tests,
  },
  {
    name: '/remote reads a cookie without the CSRF header',
    edits: [
      {
        file,
        find: "requests: 'scripted' }))",
        replace: "requests: 'browser' }))",
      },
    ],
    tests,
  },
  {
    name: '/remote reads only the cookie of a navigation',
    edits: [
      {
        file,
        find: "requests: 'scripted' }))",
        replace: "requests: 'navigation' }))",
      },
    ],
    tests,
  },
  {
    name: 'a page asks for a script’s headers',
    edits: [
      {
        file,
        find: "requests: 'navigation' }))",
        replace: "requests: 'scripted' }))",
      },
    ],
    tests,
  },
  {
    name: 'a page reads the cookie as a socket’s or a form’s',
    edits: [
      {
        file,
        find: "requests: 'navigation' }))",
        replace: "requests: 'browser' }))",
      },
    ],
    tests,
  },
  {
    name: 'no header says whom /remote answered',
    edits: [
      {
        file,
        find: 'headers: key === undefined ? undefined : AuthServer.answered({ key }),',
        replace: 'headers: undefined,',
      },
    ],
    tests,
  },
  {
    name: 'the resolvers compare by the session subject, not the key',
    edits: [
      {
        file,
        find: 'principal: config.principal, key }',
        replace: 'principal: config.principal }',
      },
    ],
    tests,
  },
  {
    name: 'OAuth options are taken and their callbacks never mounted',
    edits: [
      {
        file,
        find: "  if ('oauth' in config.http)\n    throw new Error('AuthServer.host mounts no OAuth callbacks: mount Http.make yourself')\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the principal is the first request’s, kept for the isolate',
    edits: [
      {
        file,
        find: 'Effect.provide(resolve(request), config.services)',
        replace: 'Effect.provide(resolve((globalThis.firstAsked ??= request)), config.services)',
      },
    ],
    tests,
  },
  {
    name: 'the page’s reader writes',
    edits: [
      {
        file: '../../remote-server/src/fetch.ts',
        find: "          FoldkitRemoteMutate: () =>\n            Effect.fail(\n              new RemoteMutationError({ message: 'A page render reads; it does not write' }),\n            ),\n",
        replace: '',
      },
    ],
    tests,
  },
]
