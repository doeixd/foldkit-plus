/**
 * A durable write made for someone (#405), each step broken in turn:
 * `pnpm mutate packages/remote/test/madeFor.mutations.ts`.
 */
const tests = ['packages/remote/test/outbox.test.ts', 'packages/remote/test/heardPrincipal.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
const client = '../src/client.ts'
const model = '../src/model.ts'
const outbox = '../src/outbox.ts'
const store = '../src/outboxStore.ts'
const queue = '../src/queue.ts'
const status = '../src/outboxStatus.ts'

export default [
  edit(
    'the request carries no principal',
    client,
    '...(principal === undefined ? {} : { principal }),',
    '',
  ),
  edit(
    'the outbox sends a write naming no one',
    outbox,
    'principal: expectedOf(write.madeAs),',
    'principal: undefined,',
  ),
  edit(
    "a visitor's write names someone",
    queue,
    'Visitor: () => Option.none(),',
    "Visitor: () => Option.some('User:visitor'),",
  ),
  edit(
    'a write made for someone else settles failed',
    outbox,
    "PrincipalChanged: () => 'waitForSignIn' as const,",
    '',
  ),
  edit('a new write is made for no one', model, '? stampOf(outbox)', '? Option.none<MadeAs>()'),
  edit(
    'a retried write is made for whom the page heard last',
    model,
    'Readable: ({ write: queued }) => Option.fromUndefinedOr(queued.madeAs),',
    'Readable: () => outbox.principal,',
  ),
  edit(
    'no answer is heard',
    model,
    'if (heard === undefined || generation === undefined || askedBeforeForget(model, generation)) {',
    'if (true) {',
  ),
  edit(
    'an answer that says not when it was asked is heard',
    model,
    'if (heard === undefined || generation === undefined || askedBeforeForget(model, generation)) {',
    'if (heard === undefined || askedBeforeForget(model, generation)) {',
  ),
  edit(
    'an answer to a request sent before forget is heard',
    model,
    'if (heard === undefined || generation === undefined || askedBeforeForget(model, generation)) {',
    'if (heard === undefined || generation === undefined) {',
  ),
  edit(
    'a read entry sends its answers with no generation',
    '../src/domain.ts',
    '...(after.length === 0 ? {} : { after }),\n          generation,',
    '...(after.length === 0 ? {} : { after }),',
  ),
  edit(
    'a list entry sends its pages with no generation',
    '../src/domain.ts',
    '{ principal: madeAsOf(result.principal) }),\n    ...(generation === undefined ? {} : { generation }),',
    '{ principal: madeAsOf(result.principal) }),',
  ),
  edit(
    "a write's answer says not when it was sent",
    '../src/writes.ts',
    'generation: context.bound.store.get(startedModel).refresh.floor,',
    '',
  ),
  {
    name: "Remote.mutateInto's answer says not when it was sent",
    edits: [
      {
        file: '../src/remote.ts',
        find: ': { principal: madeAsOf(outcome.principal), generation: started.refresh.floor }),',
        replace: ': { principal: madeAsOf(outcome.principal) }),',
      },
    ],
    tests: ['packages/remote/test/heardPrincipal.test.ts'],
  },
  edit(
    "the outbox's own answer says not when it was sent",
    outbox,
    ': { principal: madeAsOf(outcome.principal), generation }),',
    ': { principal: madeAsOf(outcome.principal) }),',
  ),
  edit(
    'the outbox sends under the generation before the last forget',
    outbox,
    'generation: refresh.floor,',
    'generation: refresh.floor - 1,',
  ),
  edit(
    'a page that heard no one takes no one from its queue',
    model,
    'const principal = Option.isSome(before.principal) ? before.principal : stored',
    'const principal = before.principal',
  ),
  edit(
    'a page takes its queue’s owner, and keeps the Model as it was',
    model,
    '(Option.isNone(owner) ? Option.isNone(before.owner) : owner === before.owner) &&',
    '',
  ),
  edit(
    'the store is read without its owner',
    outbox,
    '...Option.match(stored.owner, { onNone: () => ({}), onSome: owner => ({ owner }) }),',
    '',
  ),
  edit(
    'the store is written without its owner',
    store,
    '...Option.match(outbox.owner, { onNone: () => ({}), onSome: owner => ({ owner }) }),',
    '',
  ),
  edit(
    'a record is read without its owner',
    store,
    'owner: Option.fromUndefinedOr(record.owner),',
    'owner: Option.none(),',
  ),
  edit(
    'two copies keep the store’s owner',
    store,
    'owner: ownerOf(store.owner, mine.owner),',
    'owner: store.owner,',
  ),
  edit(
    'two copies keep this page’s owner',
    store,
    'owner: ownerOf(store.owner, mine.owner),',
    'owner: mine.owner,',
  ),
  edit(
    "the page's queue is stored without its owner",
    store,
    'done: outbox.done,\n  owner: outbox.owner,',
    'done: outbox.done,\n  owner: Option.none(),',
  ),
  edit(
    'a write made for someone else is sent',
    store,
    'if (!sendable(queued.write.madeAs, outbox.principal)) return Option.none()',
    '',
  ),
  edit(
    'any write is sent whoever the page heard',
    queue,
    "Signed: ({ key }) => madeAs?._tag === 'Signed' && madeAs.key === key,",
    'Signed: () => true,',
  ),
  edit("a visitor's page sends nothing", queue, 'Visitor: () => true,', 'Visitor: () => false,'),
  edit(
    'a write made for someone else is not reported',
    outbox,
    'held: holding(outbox, key, scope) ? heldIn(outbox) : []',
    'held: []',
  ),
  edit(
    'a write made for someone else shows as waiting its turn',
    status,
    '            heldFrom(write, outbox)\n              ? OutboxItemState',
    '            false\n              ? OutboxItemState',
  ),
  edit(
    'a visitor stays one after an answer names someone',
    model,
    "Visitor: () => heard._tag === 'Visitor',",
    'Visitor: () => true,',
  ),
  edit(
    'someone stays them after an answer names another',
    model,
    "Signed: ({ key }) => heard._tag === 'Signed' && heard.key === key,",
    'Signed: () => true,',
  ),
  edit(
    "a read's answer is not heard",
    model,
    'message.result.principal === undefined ? undefined : madeAsOf(message.result.principal),',
    'undefined,',
  ),
  edit(
    "a write's answer is not heard",
    model,
    'message.principal,\n          message.generation,',
    'undefined,\n          message.generation,',
  ),
  edit(
    "a list's page is not heard",
    model,
    'outbox: heardAs(model, model.outbox, message.principal, message.generation),',
    '',
  ),
  edit(
    "a list's page drops whom it was for",
    '../src/domain.ts',
    '...(result.principal === undefined ? {} : { principal: madeAsOf(result.principal) }),',
    '',
  ),
  edit(
    "the outbox's own answer drops whom it was for",
    outbox,
    ': { principal: madeAsOf(outcome.principal), generation }),',
    ': {}),',
  ),
  edit('the client drops whom an answer was for', client, 'principal: result.principal,', ''),
  edit(
    'forgetting keeps whom the page heard',
    model,
    'left: leftOf(model.outbox) },',
    'left: leftOf(model.outbox), principal: model.outbox.principal },',
  ),
  edit(
    'forgetting forgets the queue it held',
    model,
    'left: leftOf(model.outbox) },',
    'left: Option.none() },',
  ),
  edit(
    'a page that moves its scope forgets the queue it held',
    model,
    'left: switching ? leftOf(model.outbox) : before.left,',
    'left: before.left,',
  ),
  edit(
    'a page holding no queue forgets the one it left before',
    '../src/queue.ts',
    ': outbox.left',
    ': Option.none()',
  ),
  edit(
    'writes move before an answer names who signed in',
    outbox,
    'principal: Option.flatMap(outbox.principal, signedKey),',
    "principal: Option.some('User:ada'),",
  ),
  edit(
    "someone's writes move too",
    outbox,
    "(inPlace ? write.madeAs?._tag !== 'Signed' : write.madeAs?._tag === 'Visitor'),",
    "(inPlace ? write.madeAs?._tag !== 'Signed' : true),",
  ),
  edit(
    'only a visitor’s write is claimed in place',
    outbox,
    "(inPlace ? write.madeAs?._tag !== 'Signed' : write.madeAs?._tag === 'Visitor'),",
    "write.madeAs?._tag === 'Visitor',",
  ),
  edit(
    "a visitor's refused write moves too",
    outbox,
    "write.state._tag !== 'Failed' &&\n                (inPlace",
    'true &&\n                (inPlace',
  ),
  edit('a moved write is still made for a visitor', outbox, 'madeAs: signed,', ''),
  edit(
    'a moved write stays in the queue it came from',
    outbox,
    'yield* writeStored(from.key, from.scope, storedChange([], requestIds))',
    '',
  ),
  edit('a write claimed in place leaves its queue', outbox, 'if (!inPlace) {', 'if (true) {'),
  edit(
    'no write is claimed in place',
    outbox,
    '...(unclaimed.length === 0 ? [] : [moved(here, here, signed)]),',
    '',
  ),
  edit(
    'a write is claimed before the store holds it',
    outbox,
    "(write, stored) => stored && write.madeAs?._tag !== 'Signed'",
    "write => write.madeAs?._tag !== 'Signed'",
  ),
  {
    name: 'two tabs move at once: each takes a lock of its own',
    edits: [{ file: outbox, find: 'moveLock(from.key),', replace: '`race-${Math.random()}`,' }],
    tests: ['packages/remote/test/outboxTabs.browser.test.ts'],
  },
  {
    name: 'reads that disagree on whom they were for say one of them',
    edits: [
      {
        file: '../src/coalesce.ts',
        find: 'said.every(each => each === first)',
        replace: 'true',
      },
    ],
    tests: ['packages/remote/test/coalesce.test.ts'],
  },
  {
    name: 'coalesced reads drop whom they were for',
    edits: [{ file: '../src/coalesce.ts', find: '...answeredBy(results),', replace: '' }],
    tests: ['packages/remote/test/coalesce.test.ts'],
  },
  {
    name: "a visitor's write is sent naming no one",
    edits: [{ file: outbox, find: 'Visitor: () => null,', replace: 'Visitor: () => undefined,' }],
    tests: [...tests, 'packages/remote/test/outboxTabs.browser.test.ts'],
  },
  edit(
    "a write made while a visitor is heard is a visitor's, though someone owns the queue",
    '../src/queue.ts',
    "Option.filter(outbox.owner, owner => owner._tag === 'Signed'),",
    'Option.none<MadeAs>(),',
  ),
  edit(
    'the owner is whom the page heard last',
    '../src/queue.ts',
    "signedOwner(owner) || (Option.isSome(owner) && heard._tag === 'Visitor')",
    'false',
  ),
  edit(
    'a visitor heard again is a new owner',
    '../src/queue.ts',
    "signedOwner(owner) || (Option.isSome(owner) && heard._tag === 'Visitor')",
    'signedOwner(owner)',
  ),
  edit(
    'two copies keep the first owner, signed in or not',
    '../src/queue.ts',
    'signedOwner(first) || !signedOwner(second)',
    'true',
  ),
  edit(
    'two copies keep the second owner signed in',
    '../src/queue.ts',
    'signedOwner(first) || !signedOwner(second)',
    '!signedOwner(second)',
  ),
  edit(
    'a page that moves its scope keeps the old one’s owner',
    model,
    'const owner = switching ? stored : ownerOf(before.owner, stored)',
    'const owner = ownerOf(before.owner, stored)',
  ),
  edit(
    "a visitor's write moves out of a queue someone owns",
    outbox,
    'if (!claimable) return []',
    '',
  ),
  edit(
    "a write in Ada's queue is claimed for whoever is heard",
    outbox,
    'Signed: ({ key: own }) => inPlace && own === key,',
    'Signed: () => inPlace,',
  ),
  edit(
    "an unstamped write in another's queue is not held",
    status,
    '(signedOwner(outbox.owner) &&',
    '(false &&',
  ),
  {
    name: 'a restamp moves its revision on by one',
    edits: [
      {
        file: outbox,
        find: 'revision: write.revision + 2,',
        replace: 'revision: write.revision + 1,',
      },
    ],
    tests,
    survives:
      "Only a refusal another tab saves of the old revision between the move's read and its write loses to it; no test pins that interleaving.",
  },
]
