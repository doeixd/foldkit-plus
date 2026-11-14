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
const store = '../src/outboxStore.ts'
const status = '../src/outboxStatus.ts'

export default [
  // #284: a write made as one principal is never sent as another.
  edit(
    'a queue of another scope is sent',
    outbox,
    'Option.contains(outbox.key, key) && Option.contains(outbox.scope, scope)',
    'Option.contains(outbox.key, key)',
  ),
  edit(
    "another scope's waiting writes are written over",
    store,
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
    store,
    'if (queued.stored) return Option.some(queued.write)',
    'return Option.some(queued.write)',
  ),
  edit(
    'the newest waiting write is sent first',
    store,
    'for (const queued of outbox.queue) {',
    'for (const queued of [...outbox.queue].reverse()) {',
  ),
  edit('a stored write is sent without its now', outbox, 'now: write.now,', 'now: undefined,'),
  edit(
    'a send nothing answered settles the write as failed',
    outbox,
    "if (next === 'sendAgain') {",
    'if (false) {',
  ),
  edit(
    'a write another tab settled is sent again',
    outbox,
    'if (Option.isSome(there) && answeredIn(there.value, operation)) {',
    'if (false) {',
  ),
  edit(
    'a store that cannot be written holds the writes back',
    outbox,
    'Effect.succeed(readOf(key, scope, change, { unsaved: error.message }))',
    'Effect.succeed(readOf(key, scope, { entries: [], done: [] }, { unsaved: error.message }))',
  ),
  edit(
    'an input that no longer decodes is sent anyway',
    outbox,
    'Option.map(Schema.decodeUnknownOption(descriptor.Input)(input), decoded => ({',
    'Option.map(Option.some(input), decoded => ({',
  ),
  edit(
    'a merge keeps the lower revision',
    store,
    'held.revision < key.value.revision',
    'held.revision > key.value.revision',
  ),
  edit(
    'a merge brings back what was settled',
    store,
    'if (Option.isNone(key) || gone.has(key.value.operation)) continue',
    'if (Option.isNone(key)) continue',
  ),
  edit('another scope’s queue is read', store, 'record.scope === scope ?', "record.scope !== '' ?"),
  edit(
    'an answered write stays queued',
    model,
    'withoutQueued(model.outbox, message.requestId),',
    'model.outbox,',
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
    'outbox: { ...emptyOutbox, session: model.outbox.session, left: leftOf(model.outbox) },',
    'outbox: { ...emptyOutbox, left: leftOf(model.outbox) },',
  ),
  edit(
    'a refusal leaves the revision where it was',
    model,
    "revision: queued.write.revision + 1,\n                  state: { _tag: 'Failed'",
    "revision: queued.write.revision,\n                  state: { _tag: 'Failed'",
  ),
  edit(
    'a durable write is sent under an id of its own, not its operation',
    outbox,
    'mutateRemote(mutation, input, operation, {',
    'mutateRemote(mutation, input, `${operation}.sent`, {',
  ),
  // #403: a write no one is signed in to send waits for a sign-in.
  edit(
    'an Unauthenticated answer settles the write failed',
    outbox,
    "if (next === 'waitForSignIn') {",
    'if (false) {',
  ),
  edit(
    'a write waiting for a sign-in holds nothing back',
    store,
    "if (queued.write.state._tag === 'WaitingForSignIn') return Option.none()",
    'if (false) return Option.none()',
  ),
  edit(
    'a write waiting for a sign-in drops its layer',
    model,
    'WaitingForSignIn: () => true,',
    'WaitingForSignIn: () => false,',
  ),
  edit(
    'a write waiting for a sign-in is begun again over the writes after it',
    model,
    'isWaiting(prior) &&\n    entry._tag',
    'false &&\n    entry._tag',
  ),
  edit(
    'a sign-in resumes nothing',
    model,
    'if (!model.outbox.queue.some(waitsForSignIn)) return model',
    'return model',
  ),
  edit(
    'a sign-in leaves the revision where it was',
    model,
    "revision: queued.write.revision + 1,\n                state: { _tag: 'Waiting' },",
    "revision: queued.write.revision,\n                state: { _tag: 'Waiting' },",
  ),
  edit(
    'a write waiting for a sign-in is shown as waiting its turn',
    status,
    'WaitingForSignIn: ({ error }) => OutboxItemState.WaitingForSignIn({ error }),',
    'WaitingForSignIn: () => OutboxItemState.Waiting({ attempt, error: delayed }),',
  ),
  {
    name: 'a reload reads nothing back',
    edits: [
      {
        file: store,
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
        file: store,
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
        file: outbox,
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
        file: outbox,
        find: 'Effect.andThen(announce(key, Option.some(message))),',
        replace: 'Effect.andThen(Effect.void),',
      },
    ],
    tests: ['packages/remote/test/outboxTabs.browser.test.ts'],
  },
  {
    name: 'the other tabs are not told a write waits for a sign-in',
    edits: [
      {
        file: outbox,
        find: 'saved(key, scope, storedChange([waiting], [])),',
        replace: 'Effect.succeed(readOf(key, scope, storedChange([waiting], []))),',
      },
    ],
    tests: ['packages/remote/test/outboxTabs.browser.test.ts'],
  },
  {
    name: 'a send ended while it settles lets the lock go before the store says it is done',
    edits: [
      {
        file: outbox,
        find: '        Effect.uninterruptible(\n          emit(message).pipe(',
        replace: '        Effect.interruptible(\n          emit(message).pipe(',
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
  // #347: a page resumed from a server render starts from the session alone.
  {
    name: "the outbox's session mints none",
    edits: [
      {
        file: outbox,
        find: 'outbox: { ...remote.outbox, session: Option.some(mintOperation()) },',
        replace: 'outbox: remote.outbox,',
      },
    ],
    tests: ['packages/remote/test/outboxReload.test.ts'],
  },
]
