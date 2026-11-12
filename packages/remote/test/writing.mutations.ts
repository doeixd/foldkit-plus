/**
 * `writing`, each promise broken in turn:
 * `pnpm mutate packages/remote/test/writing.mutations.ts`.
 */
const tests = ['packages/remote/test/writing.test.ts']
const writing = '../src/writing.ts'
const edit = (name: string, find: string, replace: string, file = writing) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit('a refusal does not outrank an unreadable write', 'Unreadable: 4,', 'Unreadable: 6,'),
  edit('an unreadable write ranks below a sign-in wait', 'Unreadable: 4,', 'Unreadable: 2.5,'),
  edit(
    'a sign-in wait ranks below an unanswered send',
    'WaitingForSignIn: 3,',
    'WaitingForSignIn: 1.5,',
  ),
  edit('an unanswered send ranks below a send in flight', 'Unanswered: 2,', 'Unanswered: 0.5,'),
  edit('a refusal ranks below a send in flight', 'Failed: 5,', 'Failed: 0.5,'),
  edit('a first send reads as unanswered', 'attempt > 0', 'attempt >= 0'),
  edit('a send that was answered no is not told from a first send', 'attempt > 0', 'false'),
  edit(
    'the unanswered error is dropped',
    'Writing.Unanswered({ requestIds: [item.requestId], error })',
    'Writing.Unanswered({ requestIds: [item.requestId], error: Option.none() })',
  ),
  edit(
    'every write is listed, not those in the leading state',
    '.filter(saying => saying._tag === worst._tag)',
    '',
  ),
  edit(
    'a durable write is listed twice, by the ledger and the outbox',
    '.filter(requestId => !queued.has(requestId))',
    '.filter(() => true)',
  ),
  edit(
    'a retry in flight is listed as failed too',
    '...[...mutations.failed].filter(requestId => !mutations.pending.has(requestId)),',
    '...mutations.failed,',
  ),
  edit(
    'a plain write names no Mutation',
    'Option.fromUndefinedOr(mutations.writes.get(requestId)?.mutation)',
    'Option.none()',
  ),
  edit(
    'the Mutation filter reads every write',
    'mutation === undefined || Option.contains(write.mutation, mutation.name)',
    'true',
  ),
  edit(
    'the row filter reads every write',
    'layered === undefined || layered.has(write.requestId)',
    'true',
  ),
  edit(
    'a row is matched by its Entity alone, in a patch',
    'patch.entity === row.entity && patch.id === row.id',
    'patch.entity === row.entity',
  ),
  edit(
    'a row is matched by its Entity alone, in a delete',
    'drop.entity === row.entity && drop.id === row.id',
    'drop.entity === row.entity',
  ),
  edit(
    'a row ignores the layers that delete it',
    'layer.deletes.some(',
    'layer.deletes.filter(() => false).some(',
  ),
  edit(
    'a Mutation the domain does not register is read as none',
    "assertRegistered(domain, 'Mutation', domain.registry.mutations, mutation.name)",
    '',
  ),
]
