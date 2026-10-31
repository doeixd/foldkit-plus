/**
 * The durable outbox, each promise broken in turn:
 * `pnpm mutate packages/remote/test/outbox.mutations.ts`.
 */
const tests = ['packages/remote/test/outbox.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
const index = '../src/index.ts'
const model = '../src/model.ts'
const outbox = '../src/outbox.ts'

export default [
  // #284: a write made as one principal is never sent as another.
  edit(
    'a queue of another scope is sent',
    index,
    'Option.contains(outbox.key, key) && Option.contains(outbox.scope, scope)',
    'Option.contains(outbox.key, key)',
  ),
  edit(
    "another scope's waiting writes are written over",
    outbox,
    'record => record.scope !== scope && record.entries.length > 0,',
    '() => false,',
  ),
  edit(
    'a read of another scope keeps the queue',
    model,
    '(Option.isSome(model.outbox.scope) && model.outbox.scope.value !== message.scope)',
    'false',
  ),
  edit(
    'a durable write is sent by its Command, not queued',
    '../src/writes.ts',
    "Effect.succeed({ _tag: 'MutationQueued', requestId })",
    "Effect.die('sent')",
  ),
  edit(
    'a write is sent before the store holds it',
    outbox,
    "queued.write.state._tag === 'Waiting' && queued.stored",
    "queued.write.state._tag === 'Waiting'",
  ),
  edit(
    'the newest waiting write is sent first',
    outbox,
    'for (const queued of outbox.queue) {',
    'for (const queued of [...outbox.queue].reverse()) {',
  ),
  edit('a stored write is sent without its now', index, 'now: write.now,', 'now: undefined,'),
  edit(
    'a send nothing answered settles the write as failed',
    index,
    "if (result.failure._tag === 'Unreachable') {",
    'if (false) {',
  ),
  edit(
    'a write another tab settled is sent again',
    index,
    'if (Option.isSome(there) && settledIn(there.value, operation)) {',
    'if (false) {',
  ),
  edit(
    'a store that cannot be written holds the writes back',
    index,
    'Effect.succeed(readOf(key, scope, mine, { unsaved: error.message })),',
    'Effect.succeed(readOf(key, scope, { entries: [], done: [] }, { unsaved: error.message })),',
  ),
  edit(
    'an input that no longer decodes is sent anyway',
    index,
    'Option.map(Schema.decodeUnknownOption(descriptor.Input)(input), decoded => ({',
    'Option.map(Option.some(input), decoded => ({',
  ),
  edit(
    'a merge keeps the lower revision',
    outbox,
    'held.revision < key.value.revision',
    'held.revision > key.value.revision',
  ),
  edit(
    'a merge brings back what was settled',
    outbox,
    'if (Option.isNone(key) || gone.has(key.value.operation)) continue',
    'if (Option.isNone(key)) continue',
  ),
  edit(
    'another scope’s queue is read',
    outbox,
    'record.scope === scope ?',
    "record.scope !== '' ?",
  ),
  edit(
    'an answered write stays queued',
    model,
    'outbox: withoutQueued(model.outbox, message.requestId),',
    'outbox: model.outbox,',
  ),
  edit(
    'an unreadable write is not reported',
    model,
    'recorded.push(outboxUnreadable({ requestId: operation, reason: entry.reason }))',
    'void entry',
  ),
  edit(
    'a write settled elsewhere leaves what it showed as it is',
    model,
    "requests.length === 0\n      ? released\n      : reduceRemote(capabilities, released, { _tag: 'RefreshStarted', requests })",
    'released',
  ),
  edit(
    'a waiting write can be dismissed',
    model,
    'if (queued === undefined || isWaiting(queued)) return model',
    'if (queued === undefined) return model',
  ),
  edit(
    'forget mints the session away',
    model,
    'outbox: { ...emptyOutbox, session: model.outbox.session },',
    'outbox: emptyOutbox,',
  ),
  edit(
    'a refusal leaves the revision where it was',
    model,
    'revision: queued.write.revision + 1,',
    'revision: queued.write.revision,',
  ),
  edit(
    'a durable write is sent under an id of its own, not its operation',
    index,
    'mutateRemote(mutation, input, operation, {',
    'mutateRemote(mutation, input, `${operation}.sent`, {',
  ),
  {
    name: 'a reload reads nothing back',
    edits: [
      {
        file: outbox,
        find: 'if (text === undefined) return emptyStoredOutbox',
        replace: 'if (text !== null) return emptyStoredOutbox',
      },
    ],
    tests: ['packages/remote/test/outboxReload.test.ts'],
  },
  {
    name: 'every tab sends: no lock is taken',
    edits: [
      {
        file: outbox,
        find: 'onSome: locks => heldWhile(locks, name, effect),',
        replace: 'onSome: () => effect,',
      },
    ],
    tests: ['packages/remote/test/outboxTabs.browser.test.ts'],
  },
  {
    name: 'a tab never hears another',
    edits: [
      {
        file: index,
        find: 'channel.onmessage = (event: MessageEvent<unknown>) => {',
        replace: 'channel.onmessage = (event: MessageEvent<unknown>) => { return;',
      },
    ],
    tests: ['packages/remote/test/outboxTabs.browser.test.ts'],
  },
  {
    name: 'the other tabs are not told the answer before the store is',
    edits: [
      {
        file: index,
        find: 'Effect.andThen(announce(key, Option.some(message))),',
        replace: 'Effect.andThen(Effect.void),',
      },
    ],
    tests: ['packages/remote/test/outboxTabs.browser.test.ts'],
  },
  {
    name: 'a trace runs no outbox, so a durable write is never sent',
    edits: [
      {
        file: '../src/testing.ts',
        find: '...Object.entries(config.outbox?.subscriptions ?? {})',
        replace: '...Object.entries({})',
      },
    ],
    tests: ['examples/chirp/test/post.test.ts'],
  },
]
