/**
 * The document host, each guard broken in turn: `pnpm mutate
 * packages/sync/test/do.mutations.ts` checks that a test fails for every one.
 * `documentHost` (`journal.ts`) decides each upgrade; `defineDocumentHost`
 * (`do.ts`) is its Durable Object.
 */
const tests = ['packages/sync/test/do.test.ts']
const host = '../src/journal.ts'
const file = '../src/do.ts'

export default [
  {
    name: 'a socket is never asked who it serves again',
    edits: [{ file: host, find: 'if (revalidate !== undefined) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'a socket serves a changed principal on',
    edits: [
      { file: host, find: 'key === undefined || key(principal) === key(now)', replace: 'true' },
    ],
    tests,
  },
  {
    name: 'the checks outlive the socket',
    edits: [
      {
        file: host,
        find: 'socket.onClose(() => void Effect.runFork(Fiber.interrupt(fiber)))',
        replace: 'void fiber',
      },
    ],
    tests,
  },
  {
    name: 'a revoked session closes as a normal close',
    edits: [
      {
        file: host,
        find: '[4401, error.message] as const',
        replace: '[1000, error.message] as const',
      },
    ],
    tests,
  },
  {
    name: 'a changed principal closes as a revoked one',
    edits: [
      {
        file: host,
        find: "[1012, 'Who is asking changed'] as const",
        replace: "[4401, 'Who is asking changed'] as const",
      },
    ],
    tests,
  },
  {
    name: 'upgrades are refused and anything else is served',
    edits: [
      {
        file,
        find: "request.headers.get('Upgrade')?.toLowerCase() !== 'websocket'",
        replace: "request.headers.get('Upgrade')?.toLowerCase() === 'websocket'",
      },
    ],
    tests,
  },
  {
    name: 'every socket answers as no principal',
    edits: [
      {
        file: host,
        find: 'const principal = resolved.success',
        replace: 'const principal = undefined as Principal',
      },
    ],
    tests,
  },
  {
    name: 'every upgrade opens its own journal',
    edits: [
      {
        file,
        find: '(ready ??= config.openJournal(ctx, env))',
        replace: '(ready = config.openJournal(ctx, env))',
      },
    ],
    tests,
  },
  {
    name: 'a failed open provisions nothing to retry with',
    edits: [{ file, find: '            ready = undefined\n', replace: '' }],
    tests,
  },
  {
    name: 'a refused principal is a 500',
    edits: [
      {
        file: host,
        find: '{ error: resolved.failure.message }, { status: 401 }',
        replace: '{ error: resolved.failure.message }, { status: 500 }',
      },
    ],
    tests,
  },
  {
    name: 'a resolver that breaks escapes the upgrade',
    edits: [
      {
        file: host,
        find: '    ).catch(() => undefined)\n    if (opened === undefined)',
        replace:
          '    ).catch((error: unknown) => {\n      throw error\n    })\n    if (opened === undefined)',
      },
    ],
    tests,
  },
  {
    name: 'the server end is never accepted',
    edits: [{ file, find: '      server.accept()\n', replace: '' }],
    tests,
  },
  {
    name: 'settle runs without the environment or journal',
    edits: [
      {
        file,
        find: 'journal => settle(env, journal)',
        replace: '() => settle({} as Env, undefined as never)',
      },
    ],
    tests,
  },
  {
    name: 'a failed open leaks its message',
    edits: [
      {
        file: host,
        find: '.catch(() => undefined)\n    if (journal === undefined) return refuse(internalError())',
        replace:
          '.catch((error: unknown) => String(error))\n    if (typeof journal === "string") return refuse(Response.json({ error: journal }, { status: 500 }))',
      },
    ],
    tests,
  },
  {
    name: 'the host lets anyone open the document',
    edits: [
      {
        file: host,
        find: '...(opens === undefined ? {} : { opens: opens(principal) }),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the host admits every operation',
    edits: [
      {
        file: host,
        find: ': { admit: (operation: Operation) => admit(principal, operation) }),\n      }',
        replace: ': {}),\n      }',
      },
    ],
    tests,
  },
  {
    name: 'a refused socket is closed while the journal still serves it',
    edits: [{ file: host, find: '              stop()\n', replace: '' }],
    tests,
  },
  {
    name: 'the resolver is called once: a throw escapes, and its first answer is checked ever after',
    edits: [
      {
        file: host,
        find: 'const ask = Effect.suspend(() => options.resolvePrincipal(request))',
        replace: 'const ask = options.resolvePrincipal(request)',
      },
    ],
    tests,
  },
  {
    name: 'any interval is taken',
    edits: [
      {
        file: '../src/revalidate.ts',
        find: 'throw new Error(`${who}: revalidate.every must be longer than zero`)',
        replace: '{}',
      },
    ],
    tests,
  },
  {
    name: 'the resolver runs without its layer',
    edits: [
      {
        file: host,
        find: 'const resolve = Effect.provide(ask, services)',
        replace:
          'const resolve = ask as unknown as Effect.Effect<Principal, RemoteUnauthenticated>',
      },
    ],
    tests,
  },
  {
    name: 'a refused upgrade keeps its layer',
    edits: [
      {
        file: host,
        find: '    const refuse = (response: Response) => {\n      release()\n',
        replace: '    const refuse = (response: Response) => {\n',
      },
    ],
    tests,
  },
  {
    name: 'a socket that closes keeps its layer',
    edits: [{ file: host, find: '      socket.onClose(release)\n', replace: '' }],
    tests,
  },
  {
    name: 'a socket revalidation closed keeps its layer until the replica answers',
    edits: [
      {
        file: host,
        find: '                } finally {\n                  release()\n                }',
        replace: '                }',
      },
    ],
    tests,
  },
  {
    name: 'an opens that throws escapes the upgrade',
    edits: [
      {
        file: host,
        find: "      console.error('[foldkit-sync] answering an upgrade broke:', error)\n      return refuse(internalError())",
        replace: '      throw error',
      },
    ],
    tests,
  },
  {
    name: 'a runtime without a socket pair throws',
    edits: [
      {
        file,
        find: "        console.error('[foldkit-sync] serving an upgrade broke:', error)\n        return Response.json({ error: 'Internal error' }, { status: 500 })",
        replace: '        throw error',
      },
    ],
    tests,
  },
  {
    name: 'an abandoned upgrade keeps what it built',
    edits: [{ file: host, find: 'abandon: release,', replace: 'abandon: () => {},' }],
    tests,
  },
  {
    name: 'a refused reason leaves the socket open',
    edits: [
      {
        file: host,
        find: '                  socket.close()\n                } finally {',
        replace: '                } finally {',
      },
    ],
    tests,
  },
  {
    name: 'a throw while serving keeps what the upgrade built',
    edits: [{ file, find: '        abandon()\n', replace: '' }],
    survives:
      'only a throwing accept() or workerSocket reaches it, and the fake pair cannot throw there without a WebSocketPair of its own',
    tests,
  },
]
