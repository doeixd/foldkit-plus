/**
 * The document host, each guard broken in turn: `pnpm mutate
 * packages/sync/test/do.mutations.ts` checks that a test fails for every one.
 */
const tests = ['packages/sync/test/do.test.ts']
const file = '../src/do.ts'

export default [
  {
    name: 'a socket is never asked who it serves again',
    edits: [{ file, find: 'if (config.revalidate !== undefined) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'a socket serves a changed principal on',
    edits: [{ file, find: 'key === undefined || key(principal) === key(now)', replace: 'true' }],
    tests,
  },
  {
    name: 'the resolver is asked once, and its first answer checked ever after',
    edits: [
      {
        file,
        find: 'Effect.andThen(() => config.resolvePrincipal(request, this.hostEnv))',
        replace: 'Effect.andThen(config.resolvePrincipal(request, this.hostEnv))',
      },
    ],
    tests,
  },
  {
    name: 'the checks outlive the socket',
    edits: [
      {
        file,
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
        file,
        find: 'closeWith(server, 4401, error.message)',
        replace: 'closeWith(server, 1000, error.message)',
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
        file,
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
        find: 'journal = await (this.ready ??= config.openJournal(this.hostContext, this.hostEnv))',
        replace: 'journal = await config.openJournal(this.hostContext, this.hostEnv)',
      },
    ],
    tests,
  },
  {
    name: 'a refused principal is a 500',
    edits: [
      {
        file,
        find: 'return Response.json({ error: resolved.failure.message }, { status: 401 })',
        replace: 'return Response.json({ error: resolved.failure.message }, { status: 500 })',
      },
    ],
    tests,
  },
  {
    name: 'a resolver that breaks leaks its defect',
    edits: [
      {
        file,
        find: ').catch(() => undefined)',
        replace: ').catch((error: unknown) => Result.fail({ message: String(error) }))',
      },
    ],
    tests,
  },
  {
    name: 'a failed open provisions nothing to retry with',
    edits: [{ file, find: 'this.ready = undefined', replace: 'void this.ready' }],
    tests,
  },
  {
    name: 'the server end is never accepted',
    edits: [
      {
        file,
        find: `      const [client, server] = (config.pair ?? defaultPair)()
      server.accept()
      const { admit } = config`,
        replace: `      const [client, server] = (config.pair ?? defaultPair)()
      const { admit } = config`,
      },
    ],
    tests,
  },
  {
    name: 'settle runs without the environment or journal',
    edits: [
      {
        file,
        find: '{ settle: config.settle(this.hostEnv, journal) }',
        replace: '{ settle: config.settle({} as Env, undefined as never) }',
      },
    ],
    tests,
  },
  {
    name: 'a failed open leaks its message',
    edits: [
      {
        file,
        find: `      } catch {
        // A failed open provisions nothing: the next upgrade tries again.
        this.ready = undefined
        return Response.json({ error: 'Internal error' }, { status: 500 })
      }`,
        replace: `      } catch (error) {
        // A failed open provisions nothing: the next upgrade tries again.
        this.ready = undefined
        return Response.json({ error: String(error) }, { status: 500 })
      }`,
      },
    ],
    tests,
  },
  {
    name: 'the host lets anyone open the document',
    edits: [
      {
        file,
        find: '...(config.opens === undefined ? {} : { opens: config.opens(principal) }),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the host admits every operation',
    edits: [
      {
        file,
        find: ': { admit: (operation: Operation) => admit(principal, operation) }),',
        replace: ': {}),',
      },
    ],
    tests,
  },
  {
    name: 'a refused socket is closed while the journal still serves it',
    edits: [{ file, find: '              stop()\n', replace: '' }],
    tests,
  },
  {
    name: 'a resolver that throws escapes the upgrade',
    edits: [
      {
        file,
        find: 'Effect.suspend(() => config.resolvePrincipal(request, this.hostEnv))',
        replace: 'config.resolvePrincipal(request, this.hostEnv)',
      },
    ],
    tests,
  },
  {
    name: 'any interval is taken',
    edits: [
      {
        file,
        find: "throw new Error('defineDocumentHost: revalidate.every must be longer than zero')",
        replace: '{}',
      },
    ],
    tests,
  },
]
