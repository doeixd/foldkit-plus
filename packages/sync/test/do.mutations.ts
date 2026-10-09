/**
 * The document host, each guard broken in turn: `pnpm mutate
 * packages/sync/test/do.mutations.ts` checks that a test fails for every one.
 */
const tests = ['packages/sync/test/do.test.ts']
const file = '../src/do.ts'

export default [
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
        find: 'principal = await config.resolvePrincipal(request, this.hostEnv)',
        replace: 'principal = undefined as Principal',
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
      serveJournal(workerSocket(server), {`,
        replace: `      const [client, server] = (config.pair ?? defaultPair)()
      serveJournal(workerSocket(server), {`,
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
]
