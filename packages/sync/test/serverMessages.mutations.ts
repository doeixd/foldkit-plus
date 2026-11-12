/**
 * Server-only Messages and reactions, broken in turn in the readers, the
 * exchange, `appendAsServer`, the reaction runner and the Durable Object
 * host: `pnpm mutate packages/sync/test/serverMessages.mutations.ts`.
 */
const sync = '../src/sync.ts'
const journal = '../src/journal.ts'
const make = '../src/make.ts'
const server = '../src/serverJournal.ts'
const host = '../src/do.ts'
const tests = ['packages/sync/test/serverMessages.test.ts']
const edits = ['packages/sync/test/editsJournal.test.ts']
const hosts = ['packages/sync/test/do.test.ts']

export default [
  {
    name: 'a sent entry may carry a server-only Message',
    edits: [{ file: sync, find: "    if (server && kind === 'sent')", replace: '    if (false)' }],
    tests,
  },
  {
    name: 'writtenFrom reads the envelope alone, as before',
    edits: [
      {
        file: sync,
        find: "    // Read for its checks and discarded: what is appended is what was sent.\n    read(written, 'sent')",
        replace: '    checkIdentity(written)',
      },
    ],
    tests,
  },
  {
    name: 'a sent entry may claim the server’s replica ids',
    edits: [
      {
        file: sync,
        find: '    if (operation.replicaId.startsWith(SERVER_REPLICA_PREFIX))',
        replace: '    if (false)',
      },
    ],
    tests,
  },
  {
    name: 'a sent replica id is unbounded',
    edits: [
      {
        file: sync,
        find: '    if (operation.replicaId.length > MAX_SENT_REPLICA_ID)',
        replace: '    if (false)',
      },
    ],
    tests,
  },
  {
    name: 'stored history is read as strictly as a sent entry',
    edits: [
      {
        file: sync,
        find: '    operation: { encode: write, decode: readStored, compared },',
        replace: '    operation: { encode: write, decode: normalizeOperation, compared },',
      },
    ],
    tests,
  },
  {
    name: 'the outbox is read as strictly as a sent entry',
    edits: [
      {
        file: sync,
        find: '          storedFrom(pending, documentId)',
        replace: '          operationFrom(pending, documentId)',
      },
    ],
    tests,
  },
  {
    name: 'a forged server-only Message is answered Invalid, not Forbidden',
    edits: [
      {
        file: journal,
        find: '        cause instanceof UnreadableMessageError || cause instanceof ServerOnlyMessageError',
        replace: '        cause instanceof UnreadableMessageError',
      },
    ],
    tests,
  },
  {
    name: 'a forged server-only Message is not reported',
    edits: [
      {
        file: journal,
        find: '              serverOnlySubmitted(sync.documentId, id.value, replicaOf(input)),',
        replace: "              hostDefect('Notice', Cause.empty),",
      },
    ],
    tests,
  },
  {
    name: 'a replica submits a server-only Message',
    edits: [
      {
        file: sync,
        find: "            if (serverOnly(message))\n              return yield* new InvalidOutboxError({\n                message: 'Message is one only the server appends',\n              })",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a key reused for another Message appends the first',
    edits: [
      {
        file: server,
        find: '      if (!same) return yield* new ServerKeyReusedError({ key: fact })',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a key is written into the replica id as it is',
    edits: [
      {
        file: server,
        find: '      const replicaId = `${SERVER_REPLICA_PREFIX}k/${yield* sha256(fact)}`',
        replace: '      const replicaId = `${SERVER_REPLICA_PREFIX}k/${fact}`',
      },
    ],
    tests,
  },
  {
    name: 'a key past 200 characters is taken',
    edits: [
      {
        file: server,
        find: '      if (fact.length === 0 || fact.length > MAX_KEY)',
        replace: '      if (fact.length === 0)',
      },
    ],
    tests,
  },
  {
    name: 'a reaction starts at the head on its first pass',
    edits: [
      {
        file: server,
        find: '    for (const each of reactions) yield* journal.cursors.track(key, cursorName(each))',
        replace: '',
      },
      {
        file: server,
        find: '      if (Option.isNone(tracked))\n        return yield* Effect.die(',
        replace:
          '      if (Option.isNone(tracked)) {\n        yield* journal.cursors.track(key, name)\n        return { runs: 0, next: Option.some(Duration.zero) }\n      }\n      if (false)\n        return yield* Effect.die(',
      },
    ],
    tests,
  },
  {
    name: 'a reply is named by its trigger’s place in the order',
    edits: [
      {
        file: server,
        find: '              envelope(`${replyOf}/${index}`, 1, sequence, message, recorded.messageVersion),',
        replace:
          '              envelope(`${SERVER_REPLICA_PREFIX}r/${reaction.name}/${index}`, sequence, sequence, message, recorded.messageVersion),',
      },
    ],
    tests,
  },
  {
    name: 'a key the journal refused stays used',
    edits: [
      {
        file: server,
        find: "        Effect.tapErrorTag('InvalidOperationError', () => forget(fact)),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a pass that breaks takes react down',
    edits: [
      {
        file: server,
        find: '          Cause.hasInterruptsOnly(cause)\n            ? Effect.failCause(cause)',
        replace: '          true\n            ? Effect.failCause(cause)',
      },
    ],
    tests,
  },
  {
    name: 'the first reaction takes the whole budget',
    edits: [
      {
        file: server,
        find: '      const share = Math.ceil(budget / (order.length - at))',
        replace: '      const share = budget',
      },
    ],
    tests,
  },
  {
    name: 'the finished record names no epoch',
    edits: [
      {
        file: server,
        find: "canonical(['react', documentId, reaction.name, opId, 'finished', epoch])",
        replace: "canonical(['react', documentId, reaction.name, opId, 'finished'])",
      },
    ],
    tests,
  },
  {
    name: 'a run that can never succeed is retried',
    edits: [{ file: server, find: '          failure.permanent ||', replace: '' }],
    tests,
  },
  {
    name: 'a failing run parks after its attempts, however short the outage',
    edits: [
      {
        file: server,
        find: '          (tried >= handler.attempts && now - since >= Duration.toMillis(handler.parkAfter))',
        replace: '          tried >= handler.attempts',
      },
    ],
    tests,
  },
  {
    name: 'the journal failing counts as the run’s failure',
    edits: [
      {
        file: server,
        find: "        if (failure._tag === 'JournalError' && !unreadable(failure.cause)) return yield* failure",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'nothing is parked',
    edits: [
      {
        file: server,
        find: '        yield* journal.cursors.park(key, {',
        replace: '        void ({',
      },
    ],
    tests,
  },
  {
    name: 'an answer outside appends is appended',
    edits: [
      {
        file: server,
        find: '                Option.filter(tagOf(message), tag => reaction.appends.has(tag)),',
        replace: '                tagOf(message),',
      },
    ],
    tests,
  },
  {
    name: 'an answer of any length is appended',
    edits: [
      {
        file: server,
        find: '            if (messages.length > MAX_APPENDS)',
        replace: '            if (false)',
      },
    ],
    tests,
  },
  {
    name: 'a failing reaction is run again before its backoff',
    edits: [
      {
        file: server,
        find: '      if (attempts > 0 && wait > 0) return { runs: 0, next: Option.some(Duration.millis(wait)) }',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a pass with nothing new writes the cursor anyway',
    edits: [
      {
        file: server,
        find: '        at > cursor ? journal.cursors.advance(key, name, epoch, at) : Effect.void',
        replace: '        journal.cursors.advance(key, name, epoch, at)',
      },
    ],
    tests,
    survives:
      'an advance to the cursor it holds writes the row as it was, which changes no page of the file; the guard saves a statement (a D1 round trip) on every idle pass',
  },
  {
    name: 'a parked run of a reset history runs again',
    edits: [
      {
        file: server,
        find: '      if (row.epoch !== epoch)\n        return yield* new StaleParkedRunError',
        replace: '      if (false)\n        return yield* new StaleParkedRunError',
      },
    ],
    tests,
  },
  {
    name: 'no parked run is stale',
    edits: [
      {
        file: server,
        find: '              stale: row.epoch !== epoch,',
        replace: '              stale: false,',
      },
    ],
    tests,
  },
  {
    name: 'a cycle among reactions is taken',
    edits: [{ file: server, find: '  checkAcyclic(reactions)\n', replace: '\n' }],
    tests,
  },
  {
    name: 'a reaction of another contract is taken',
    edits: [
      { file: server, find: '    if (each.sync !== options.sync)', replace: '    if (false)' },
    ],
    tests,
  },
  {
    name: 'settledThrough is the journal’s cursor',
    edits: [{ file: server, find: '      if (at < lowest) lowest = at', replace: '' }],
    tests: edits,
  },
  {
    name: 'absorbing compacts past the reactions',
    edits: [
      {
        file: journal,
        find: '          return Math.min(through, yield* server.settledThrough)',
        replace: '          return through',
      },
    ],
    tests: edits,
  },
  {
    name: 'editsJournal walks the log again from the floor on each start',
    edits: [
      {
        file: journal,
        find: '    if (through > cursor) yield* journal.cursors.advance(key, EDITS_CURSOR, epoch, through)',
        replace: '',
      },
    ],
    tests: edits,
  },
  {
    name: 'a Message in both sets is taken',
    edits: [
      {
        file: make,
        find: '      if (durableTags.has(tag))\n        throw new Error(`Sync.make: "${tag}" is both durable and server-only`)',
        replace: '      void tag',
      },
    ],
    tests,
  },
  {
    name: 'the host replies before setting the alarm',
    edits: [
      {
        file: host,
        find: '            arm(ALARM_AFTER_COMMIT).then(',
        replace: '            Promise.resolve().then(',
      },
    ],
    tests: hosts,
  },
  {
    name: 'a settle that fails leaves the alarm unset',
    edits: [
      {
        file: host,
        find: '                  if (server !== undefined) yield* afterExchange(journal)\n                  if (settle !== undefined) yield* settle(env, journal)',
        replace:
          '                  if (settle !== undefined) yield* settle(env, journal)\n                  if (server !== undefined) yield* afterExchange(journal)',
      },
    ],
    tests: hosts,
  },
  {
    name: 'two passes run at once',
    edits: [
      {
        file: server,
        find: '  }).pipe(passes.withPermits(1)) as Effect.Effect<Option.Option<Duration.Duration>, never, R>',
        replace: '  }) as Effect.Effect<Option.Option<Duration.Duration>, never, R>',
      },
    ],
    tests: hosts,
  },
  {
    name: 'an alarm being run counts as one set',
    edits: [
      {
        file: host,
        find: 'if (current === null || current <= Date.now() || current > at)',
        replace: 'if (current === null || current > at)',
      },
    ],
    tests: hosts,
  },
  {
    name: 'a failed setAlarm counts the commit as armed',
    edits: [{ file: host, find: '          if (armed) seen = at', replace: '          seen = at' }],
    tests: hosts,
  },
  {
    name: 'the base class’s alarm is overridden',
    edits: [
      {
        file: host,
        find: '        await (baseAlarm as (...info: Array<unknown>) => Promise<void>).apply(this, info)',
        replace: '        void 0',
      },
    ],
    tests: hosts,
  },
  {
    name: 'a reaction of another contract is found at the first upgrade',
    edits: [
      { file: host, find: '        if (each.sync !== config.sync)', replace: '        if (false)' },
    ],
    tests: hosts,
  },
  {
    name: 'the alarm opens the journal without reactions',
    edits: [{ file: host, find: '        if (server === undefined) return\n', replace: '' }],
    tests: hosts,
  },
  {
    name: 'the host’s alarm runs nothing',
    edits: [{ file: host, find: '      await this.react()', replace: '' }],
    tests: hosts,
  },
  {
    name: 'the host moves an alarm later',
    edits: [
      {
        file: host,
        find: '  if (current === null || current <= Date.now() || current > at) await storage.setAlarm(at)',
        replace: '  await storage.setAlarm(at)',
      },
    ],
    tests: hosts,
  },
  {
    name: 'a pass that broke leaves the alarm unset',
    edits: [
      {
        file: host,
        find: '        await arm(ALARM_AFTER_DEFECT).catch(() => undefined)',
        replace: '',
      },
    ],
    tests: hosts,
  },
]
