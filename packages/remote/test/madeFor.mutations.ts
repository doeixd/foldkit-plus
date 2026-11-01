/**
 * A durable write made for someone (#405), each step broken in turn:
 * `pnpm mutate packages/remote/test/madeFor.mutations.ts`.
 */
const tests = ['packages/remote/test/outbox.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
const client = '../src/client.ts'
const model = '../src/model.ts'
const outbox = '../src/outbox.ts'

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
    'principal: Option.getOrUndefined(signedKey(write.madeAs)),',
    'principal: undefined,',
  ),
  edit(
    "a visitor's write names someone",
    outbox,
    'Visitor: () => Option.none(),',
    "Visitor: () => Option.some('User:visitor'),",
  ),
  edit(
    'a write made for someone else settles failed',
    outbox,
    "PrincipalChanged: () => 'waitForSignIn' as const,",
    '',
  ),
  edit('a new write is made for no one', model, '? outbox.principal', '? Option.none<MadeAs>()'),
  edit(
    'a retried write is made for whom the page heard last',
    model,
    'Readable: ({ write: queued }) => Option.fromUndefinedOr(queued.madeAs),',
    'Readable: () => outbox.principal,',
  ),
  edit('no answer is heard', model, 'if (heard === undefined) return outbox', 'return outbox'),
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
    'outbox: heardAs(withoutQueued(model.outbox, message.requestId), message.principal),',
    'outbox: withoutQueued(model.outbox, message.requestId),',
  ),
  edit(
    "a list's page is not heard",
    model,
    'outbox: heardAs(model.outbox, message.principal),',
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
    ': { principal: madeAsOf(outcome.principal) }),',
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
    'writes move into the queue they came from',
    outbox,
    'left => left.key !== key || left.scope !== scope',
    '() => true',
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
    "write => write.madeAs?._tag === 'Visitor' && write.state._tag !== 'Failed',",
    "write => write.state._tag !== 'Failed',",
  ),
  edit(
    "a visitor's refused write moves too",
    outbox,
    "write => write.madeAs?._tag === 'Visitor' && write.state._tag !== 'Failed',",
    "write => write.madeAs?._tag === 'Visitor',",
  ),
  edit(
    'a moved write is still made for a visitor',
    outbox,
    "madeAs: { _tag: 'Signed', key } as const,",
    '',
  ),
  edit(
    'a moved write stays in the queue it came from',
    outbox,
    'yield* writeStored(from.key, from.scope, { entries: [], done: requestIds })',
    '',
  ),
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
]
