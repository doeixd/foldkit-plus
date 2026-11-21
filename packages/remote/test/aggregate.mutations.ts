/**
 * `foldkit-remote/aggregate`, the read entry's reused plan and the store path
 * Remote reads declare, broken in turn:
 * `pnpm mutate packages/remote/test/aggregate.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/remote/test/aggregate.test.ts']
const reuse = ['packages/remote/test/readEntryReuse.test.ts']
const aggregate = '../src/aggregate.ts'

const edit = (name: string, find: string, replace: string, file = aggregate, on = tests) => ({
  name,
  edits: [{ file, find, replace }],
  tests: on,
})

export default [
  edit(
    'a min or max row leaving that held the extreme is not read again',
    '    remove: row => {\n      if (!dirty && heldExtreme(row)) dirty = true\n    },',
    '    remove: () => {},',
  ),
  edit(
    'a changed extreme that loses is kept without reading the rows again',
    '        current = stepped\n      else dirty = true',
    '        current = stepped\n      else current = next',
  ),
  edit(
    'a changed extreme is read again even when it still wins',
    '      if (Option.isSome(next) && Option.isSome(stepped) && sameNumber(stepped.value, next.value))\n        current = stepped\n      else dirty = true',
    '      dirty = true',
  ),
  edit(
    'a rolled-back write keeps its delta: the rows of layers taken away are not followed',
    '      layerKeys(was.optimistic, changed)\n',
    '',
  ),
  edit(
    'a pending write is not followed: the rows of layers added are not followed',
    '      layerKeys(inputs.optimistic, changed)\n',
    '',
  ),
  edit(
    'a body reading other rows is followed row by row',
    '    if (storeMoved && reachesOthers) return Option.none()\n',
    '',
  ),
  edit(
    'a store reached by no recorded write is taken as unchanged',
    '  if (target === undefined || start === undefined) return Option.none()',
    '  if (target === undefined || start === undefined) return Option.some(changed)',
  ),
  edit(
    'a write past the remembered ones is taken as no change',
    '    if (step === undefined) return Option.none()',
    '    if (step === undefined) return Option.some(changed)',
  ),
  edit(
    'a change of viewer is followed row by row',
    '    if (!sameContext(was.context, inputs.context)) return Option.none()\n',
    '',
  ),
  edit(
    'a deleted row of the list is judged again rather than dropped',
    '          if (isTombstone(visible, key)) swap(state, key, undefined)',
    '          if (isTombstone(visible, key)) rejudge.push(key)',
  ),
  edit(
    'a deleted row coming back is not seen',
    '          if ((state.edges ??= edgesOf()).has(key)) rejudge.push(key)',
    '          void edgesOf',
  ),
  edit(
    'a row a pending change took off the list stays counted',
    '      if (stayed < state.members.size) {',
    '      if (stayed < 0) {',
  ),
  edit(
    'a row a change put on the list is not judged',
    '        if (!member || changed.has(key)) rejudge.push(key)',
    '        if (changed.has(key)) rejudge.push(key)',
  ),
  edit(
    'every and any do not follow a changed row',
    '    replace: (before, after) => void (holding += holds(after) - holds(before)),',
    '    replace: () => {},',
  ),
  edit(
    'sum and count do not take a row away',
    '    remove: row => void (total += aggregate.deleteDelta(row)),',
    '    remove: () => {},',
  ),
  edit(
    'a row judged once stays unjudged',
    '    state.unjudged += Number(after?.unjudged ?? false) - Number(before?.unjudged ?? false)',
    '    state.unjudged += Number(after?.unjudged ?? false)',
  ),
  edit(
    'a write reports none of the rows it wrote',
    '      keys.push(key)\n',
    '',
    '../src/storeSteps.ts',
  ),
  edit(
    'a read entry never reuses its plan',
    'if (last !== undefined && last.remote === remote &&',
    'if (false && last !== undefined && last.remote === remote &&',
    '../src/domain.ts',
    reuse,
  ),
  edit(
    'a read entry reuses its plan across a store change',
    'last.remote === remote && last.policy',
    'last.policy',
    '../src/domain.ts',
    reuse,
  ),
  edit(
    'a read entry reuses its plan across a change of policy',
    'last.policy === policy && at < last.until',
    'at < last.until',
    '../src/domain.ts',
    reuse,
  ),
  edit(
    'a read entry reuses its plan past the time it says to read again',
    'last.policy === policy && at < last.until',
    'last.policy === policy',
    '../src/domain.ts',
    reuse,
  ),
  edit(
    'a Surface.at entry is taken to read nothing beside the store',
    "  !('projectionOf' in entry || 'instancesOf' in entry)",
    '  true',
    '../src/active.ts',
    reuse,
  ),
  edit(
    'another list changing while a write is pending is taken as no change',
    '  (a.connections === b.connections || !pending(a.optimistic)) &&\n',
    '',
    aggregate,
    ['packages/remote/test/throughOthers.test.ts'],
  ),
  {
    ...edit(
      'the values kept from before a live patch changing alone is not a store change',
      '      was.optimistic.layers !== inputs.optimistic.layers ||\n      was.kept !== inputs.kept',
      '      was.optimistic.layers !== inputs.optimistic.layers',
    ),
    survives:
      'no Message changes `kept` alone: a live patch that records a kept value writes the row, and an answer or a failure that drops one takes its layer away, so the store or the layers move in the same step',
  },
  edit(
    'a forgotten tombstone reports no key',
    '  return stepped(store, next, [key])',
    '  return stepped(store, next, [])',
    '../src/store.ts',
  ),
  edit(
    'the aggregate is over the window a read of the list shows',
    '          .shown(remote, identity, inputs.connection)\n',
    '          .shown(remote, identity, inputs.connection)\n          .slice(0, 25)\n',
  ),
  edit(
    'what the list and the query say is worked out on every call',
    '  if (known !== undefined) return known\n',
    '',
    aggregate,
    ['packages/remote/test/aggregateCost.test.ts'],
  ),
  edit(
    'a Surface over a Remote read is kept by the store path it names',
    'Metadata.summarize(projection.metadata).length > 0 ? Option.none() : pathsRead(projection)',
    'pathsRead(projection)',
    '../../surface/src/writes.ts',
    ['packages/remote/test/keptDrawing.test.ts'],
  ),
  edit(
    'an entity read names no path',
    '    dependencies: storePaths(bound.store),',
    '    dependencies: [],',
    '../src/domain.ts',
  ),
  edit(
    'a list read names a path it does not read',
    '      dependencies: storePaths(store),',
    "      dependencies: [['viewer']],",
    '../src/remote.ts',
  ),
  edit(
    'a raw optic claims the empty path',
    'store.dependency?.length ? [store.dependency] : []',
    'store.dependency ? [store.dependency] : []',
    '../src/storePath.ts',
  ),
]
