/**
 * Row revisions and read-after tokens on Remote's wire (#544), each rule
 * broken in turn: `pnpm mutate packages/remote/test/readAfter.mutations.ts`.
 */
const tests = ['packages/remote/test/readAfter.test.ts', 'packages/remote/test/revision.test.ts']
const store = '../src/store.ts'
const model = '../src/model.ts'
const readAfter = '../src/readAfter.ts'
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
    ' : revision < held.revision)',
    ' : revision <= held.revision)',
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
    '  const nextRevision = revision ?? previous.revision\n',
    '  const nextRevision = revision\n',
  ),
  edit(
    'a live patch ignores the revision held',
    events,
    '    olderThanHeld(store[key], event.revision) ||\n',
    '    false ||\n',
  ),
  edit(
    'a floor clears on behind',
    readAfter,
    '    else if (behind.has(key)) {\n      held.add(key)\n      waiting.add(key)\n    } else confirmed.add(key)',
    '    else confirmed.add(key)',
  ),
  edit(
    'a floor clears on an answer asked without its token',
    readAfter,
    'if (tokens.get(key) !== floor && !pastFloor(store[key], revisions.get(key))) held.add(key)',
    'if (false) held.add(key)',
  ),
  edit(
    'a row named in behind is written',
    readAfter,
    'clearFloors(writeRead(store, requests, result, now, held), confirmed)',
    'clearFloors(writeRead(store, requests, result, now), confirmed)',
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
    'a snapshot keeps a floor too long for the wire',
    persistence,
    '  if (entry.floor !== undefined && !isToken(entry.floor))',
    "  if (entry.floor !== undefined && (typeof entry.floor !== 'string' || entry.floor === ''))",
  ),
  edit(
    'a behind answer waits for nothing',
    readAfter,
    '        waiting,\n        now,\n      ),',
    '        [],\n        now,\n      ),',
  ),
  edit(
    'a waiting row is read at once',
    plan,
    'return held?.floor === undefined ? undefined : held.behind?.at',
    'return undefined',
  ),
  edit('every wait is a second', store, 'Math.min(30_000, 1000 * 2 ** (tries - 1))', '1000'),
  edit(
    'a wait is never capped',
    store,
    'Math.min(30_000, 1000 * 2 ** (tries - 1))',
    '1000 * 2 ** (tries - 1)',
  ),
  edit('tries are not counted', store, '(held.behind?.tries ?? 0) + 1', '1'),
  edit(
    'a newer write waits as the last one did',
    store,
    '    const { behind: _waited, ...rest } = held\n    edit.set(key, { ...rest, floor: token })',
    '    edit.set(key, { ...held, floor: token })',
  ),
  edit(
    'the retry is never read',
    '../src/domain.ts',
    'Stream.fromEffect(read(retry.requirements, retry.after, refresh))',
    'Stream.empty',
  ),
  edit(
    'the retry reads without its tokens',
    '../src/domain.ts',
    'read(retry.requirements, retry.after, refresh)',
    'read(retry.requirements, [], refresh)',
  ),
  edit(
    'the retry waits for nothing',
    '../src/domain.ts',
    'Effect.sleep(Math.max(0, retry.at - now()))',
    'Effect.sleep(0)',
  ),
  edit(
    'a live patch from a stream opened before the write is written',
    events,
    '    (floor !== undefined && context.token !== floor && !pastFloor(store[key], event.revision))',
    '    false',
  ),
  edit(
    'a live patch at the token keeps the floor',
    events,
    'store: !hasWritten || floor === undefined ? patched : clearFloors(patched, [key]),',
    'store: patched,',
  ),
  edit(
    'a live event carries no token',
    '../src/liveReads.ts',
    '        ...(token === undefined ? {} : { token }),\n',
    '',
  ),
  edit(
    'a read at a newer revision without the token is held',
    readAfter,
    ' && !pastFloor(store[key], revisions.get(key))) held.add(key)',
    ') held.add(key)',
  ),
  edit(
    'a newer revision never ends a floor',
    store,
    'revision !== undefined && held?.revision !== undefined && revision > held.revision',
    'false',
  ),
  edit(
    'a revision as old as held ends a floor',
    store,
    'revision !== undefined && held?.revision !== undefined && revision > held.revision',
    'revision !== undefined && held?.revision !== undefined && revision >= held.revision',
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
    'a tombstone asked again drops a row at its revision',
    store,
    '(held.tombstone && held.stale.size === 0',
    '(held.tombstone',
  ),
  edit(
    'a tombstone not asked again takes a row at its revision',
    store,
    '(held.tombstone && held.stale.size === 0',
    '(held.tombstone && held.stale.size > 0',
  ),
  edit(
    "a row at a tombstone's revision comes back",
    store,
    '? revision <= held.revision :',
    '? revision < held.revision :',
  ),
  edit(
    'a row named behind with no floor is taken as gone',
    readAfter,
    '  const held = new Set<EntityKey>(behind)',
    '  const held = new Set<EntityKey>()',
  ),
  edit(
    'a row named behind is taken as gone where nothing writes',
    model,
    '    const held = rowsOf(result.behind)\n',
    '    const held = rowsOf(undefined)\n',
  ),
  edit(
    'a list page writes a floored row',
    model,
    '          : readAfterIn(capabilities).read(\n              model.entities,\n              requests,\n              payloadRead,',
    '          : plainReads.read(\n              model.entities,\n              requests,\n              payloadRead,',
  ),
  edit(
    'Remote.prefetch reads without the token',
    '../src/remote.ts',
    '  const { requirements, after } = tokens.withTokens(store, missing)',
    '  const { requirements } = tokens.withTokens(store, missing)\n  const after: ReadonlyArray<never> = []',
  ),
  edit(
    'prefetch and satisfy read without the token',
    '../src/remote.ts',
    '      const { requirements, after } = readAfterIn(bound[Capability]).withTokens(',
    '      const { requirements, after: _after } = readAfterIn(bound[Capability]).withTokens(',
  ),
]
