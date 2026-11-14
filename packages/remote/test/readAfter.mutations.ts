/**
 * Row revisions and read-after tokens on Remote's wire (#544), each rule
 * broken in turn: `pnpm mutate packages/remote/test/readAfter.mutations.ts`.
 */
const tests = ['packages/remote/test/readAfter.test.ts', 'packages/remote/test/revision.test.ts']
const store = '../src/store.ts'
const model = '../src/model.ts'
const plan = '../src/plan.ts'
const events = '../src/liveEvents.ts'
const persistence = '../src/persistence.ts'
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'revisions compare with <=',
    store,
    '(held.tombstone ? revision <= held.revision : revision < held.revision)',
    '(held.tombstone ? revision <= held.revision : revision <= held.revision)',
  ),
  edit(
    'no revision is compared',
    store,
    '  revision !== undefined &&\n  held?.revision !== undefined &&\n',
    '  false &&\n',
  ),
  edit(
    'a written row forgets the revision it held',
    store,
    '      write.revision ?? held?.revision,\n',
    '      write.revision,\n',
  ),
  edit(
    'a live patch ignores the revision held',
    events,
    '  if (olderThanHeld(store[key], event.revision))\n',
    '  if (false)\n',
  ),
  edit(
    'a floor clears on behind',
    model,
    'if (tokens.get(key) === floor && !behind.has(key)) confirmed.add(key)',
    'if (tokens.get(key) === floor) confirmed.add(key)',
  ),
  edit(
    'a floor clears on an answer asked without its token',
    model,
    'if (tokens.get(key) === floor && !behind.has(key)) confirmed.add(key)',
    'if (!behind.has(key)) confirmed.add(key)',
  ),
  edit(
    'a row named in behind is written',
    model,
    '      writeRead(model.entities, message.requests, message.result, message.now, held),',
    '      writeRead(model.entities, message.requests, message.result, message.now),',
  ),
  edit(
    'a floored row is not planned',
    plan,
    '      force || expired || floored\n',
    '      force || expired\n',
  ),
  edit(
    'the token is dropped from a floored read',
    plan,
    '    after.push({ entity: requirement.entity, id: requirement.id, token })\n',
    '',
  ),
  edit(
    'a write answer sets no floor',
    model,
    '          message.after === undefined || repeated\n',
    '          true\n',
  ),
  edit(
    'a live stream subscribes without its floors',
    '../src/liveReads.ts',
    '        ...(tokens.length === 0 ? {} : { floors: tokens }),\n',
    '',
  ),
  edit(
    'why names no wait',
    '../src/whyReasons.ts',
    '  if (floor !== undefined) reasons.push(Why.ReadAfter({ row, via, token: floor }))',
    '',
  ),
  edit(
    'a snapshot forgets the floor',
    persistence,
    '  ...(entry.floor === undefined ? {} : { floor: entry.floor }),\n})',
    '})',
  ),
  edit(
    'a coalesced read drops its tokens',
    '../src/coalesce.ts',
    '                    ...(after.length === 0 ? {} : { after }),\n',
    '',
  ),
  edit(
    'a read at a token joins one without it',
    '../src/coalesce.ts',
    'key: stableStringify([requirementKey(requirement), token ?? null]),',
    'key: requirementKey(requirement),',
  ),
  edit(
    'a cut ignores how many tokens a read carries',
    '../src/coalesce.ts',
    '        piece.tokens + token <= MAX_READ_AFTER,',
    '        true,',
  ),
  edit(
    'a coalesced answer drops behind',
    '../src/coalesce.ts',
    '            ...(behind.length === 0 ? {} : { behind }),\n',
    '',
  ),
  edit(
    'a plan sends every floored row at once',
    plan,
    '    if (after.length === MAX_READ_AFTER) return false\n',
    '',
  ),
  edit(
    'a row at two tokens in one batch reads at the last',
    '../src/coalesce.ts',
    '            if (held !== undefined && held !== token) {',
    '            if (false) {',
  ),
  edit(
    'a tombstone forgets the revision it was gone at',
    store,
    '    ...(revision === undefined ? {} : { revision }),\n  })\n}',
    '  })\n}',
  ),
  edit(
    "a row at a tombstone's revision comes back",
    store,
    '(held.tombstone ? revision <= held.revision : revision < held.revision)',
    'revision < held.revision',
  ),
]
