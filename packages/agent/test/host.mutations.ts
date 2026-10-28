/**
 * The hosts, broken in turn: `pnpm mutate packages/agent/test/host.mutations.ts`.
 */
const file = '../src/host.ts'
const page = ['packages/agent/test/host.test.ts']
const headless = ['packages/agent/test/headless.test.ts']
const both = [...page, ...headless]

export default [
  {
    name: 'a replay of an older Model is taken as a commit',
    edits: [
      {
        file,
        find: '      if (boot.current !== model) continue\n',
        replace: '',
      },
    ],
    tests: page,
  },
  {
    name: 'a runtime booted while the last one never started is refused',
    edits: [
      {
        file,
        find: 'if (Option.isSome(running)) throw refuse()',
        replace: 'if (boots.size > 0) throw refuse()',
      },
    ],
    tests: page,
  },
  {
    name: 'a second runtime from one config is not refused at its first read',
    edits: [
      {
        file,
        find: 'if (Option.isSome(running)) throw refuse()',
        replace: 'if (false) throw refuse()',
      },
    ],
    tests: page,
  },
  {
    name: 'a second runtime started at once replaces the first',
    edits: [
      {
        file,
        find: 'if (boot === undefined || Option.isSome(running)) return Stream.die(refuse())',
        replace: 'if (boot === undefined) return Stream.die(refuse())',
      },
    ],
    tests: page,
  },
  {
    name: 'a refused second runtime halts the hosted one',
    edits: [{ file, find: 'if (!refusals.has(context.error)) {', replace: 'if (true) {' }],
    tests: page,
  },
  {
    name: 'a dispatched Message never reaches the runtime',
    edits: [
      {
        file,
        find: 'return Stream.fromQueue(boot.queue).pipe(',
        replace: 'return Stream.never.pipe(',
      },
    ],
    tests: [...page, 'packages/agent/test/host.browser.test.ts'],
  },
  {
    name: 'every boot shares one queue',
    edits: [
      {
        file,
        find: '  const boots = new Map<number, Boot>()\n',
        replace:
          '  const boots = new Map<number, Boot>()\n  const shared = Effect.runSync(Queue.unbounded<Message>())\n',
      },
      {
        file,
        find: 'queue: Effect.runSync(Queue.unbounded<Message>()),',
        replace: 'queue: shared,',
      },
    ],
    tests: page,
  },
  {
    name: 'a stopped runtime is still taken for a running one',
    edits: [{ file, find: "if (!boot.crashed) core.stopped('stopped')", replace: '' }],
    tests: page,
  },
  {
    name: 'a crashed runtime reads as stopped once disposed',
    edits: [
      {
        file,
        find: "if (!boot.crashed) core.stopped('stopped')",
        replace: "core.stopped('stopped')",
      },
    ],
    tests: page,
  },
  {
    name: 'a crash leaves the host accepting Messages',
    edits: [{ file, find: "          core.stopped('crashed')\n", replace: '' }],
    tests: page,
  },
  {
    name: "the application's own crash report is dropped",
    edits: [{ file, find: '        config.crash?.report?.(context)\n', replace: '' }],
    tests: page,
  },
  {
    name: 'every transition tells subscribe, changed or not',
    edits: [
      {
        file,
        find: 'if (after !== before) tell(modelListeners, undefined)',
        replace: 'tell(modelListeners, undefined)',
      },
    ],
    tests: both,
  },
  {
    name: "a listener's throw escapes into the runtime",
    edits: [
      {
        file,
        find: '    try {\n      listener(value)\n    } catch (error) {\n      queueMicrotask(() => {\n        throw error\n      })\n    }',
        replace: '    listener(value)',
      },
    ],
    tests: headless,
  },
  {
    name: 'the resources are built for every Command',
    edits: [{ file, find: 'Effect.cached(', replace: 'Effect.succeed(' }],
    tests: headless,
  },
  {
    name: 'a Subscription restarts on every change of the Model',
    edits: [{ file, find: 'Stream.changesWith(equivalence),', replace: '' }],
    tests: headless,
  },
  {
    name: 'an interruptible Command runs',
    edits: [{ file, find: 'if (command.key !== undefined) {', replace: 'if (false) {' }],
    tests: headless,
  },
  {
    name: 'a dying Command is ignored',
    edits: [
      {
        file,
        find: 'effect.pipe(Effect.catchCause(cause => Effect.sync(() => crash(cause)))),',
        replace: 'effect.pipe(Effect.catchCause(() => Effect.void)),',
      },
    ],
    tests: headless,
  },
  {
    name: 'a throwing update does not stop the runtime',
    edits: [{ file, find: '      crash(Cause.die(error))\n', replace: '' }],
    tests: headless,
  },
  {
    name: 'dispose keeps the resources',
    edits: [
      {
        file,
        find: '    return Effect.runPromise(Scope.close(scope, Exit.void))',
        replace: '    return Promise.resolve()',
      },
    ],
    tests: headless,
  },
]
