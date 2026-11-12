/**
 * The temporal laws of #482, each ordering or epoch guard broken in turn:
 * `pnpm mutate packages/remote/test/temporal.mutations.ts` checks that
 * `temporal.test.ts` fails for every one.
 */
const tests = ['packages/remote/test/temporal.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  // Settlement order
  edit(
    'a later answer leaves an earlier edit still showing a field it settled',
    '../src/optimistic.ts',
    'if (settled === undefined) return [patch]',
    'return [patch]',
  ),
  edit(
    'a later answer takes from an earlier edit a field it did not write',
    '../src/optimistic.ts',
    'values: withoutFields(patch.values, settled),',
    'values: {},',
  ),
  edit(
    'a request keeps no order',
    '../src/ledger.ts',
    '  order: new Map([...state.order, [requestId, state.sequence + 1]]),\n',
    '',
  ),
  edit(
    'an earlier answer overwrites a field a later one settled',
    '../src/ledger.ts',
    '.filter(([field]) => !newer(`${key}\\u0000${field}`)),',
    '.filter(() => true),',
  ),
  // Optimistic overlay
  edit(
    'a request begun later loses to an earlier one',
    '../src/optimistic.ts',
    ': [...optimistic.layers, { id: requestId, patches, deletes, viewer }],',
    ': [{ id: requestId, patches, deletes, viewer }, ...optimistic.layers],',
  ),
  edit(
    'a failure removes every layer',
    '../src/optimistic.ts',
    'const layers = optimistic.layers.filter(layer => layer.id !== id)',
    'const layers = optimistic.layers.filter(() => false)',
  ),
  edit(
    'confirmed reads the optimistic layers too',
    '../src/domain.ts',
    'read: (root: AppModel) => projection.read(withoutOptimistic(bound, root)),',
    'read: (root: AppModel) => projection.read(root),',
  ),
  // Answer against the live stream
  edit(
    'an answer awaits no echo',
    '../src/liveEvents.ts',
    '): Readonly<Record<EntityKey, AwaitedEcho>> => {\n  const kept',
    '): Readonly<Record<EntityKey, AwaitedEcho>> => {\n  return echoes\n  const kept',
  ),
  edit(
    'a contradicting patch is written',
    '../src/liveEvents.ts',
    'const contradicted = named.filter(field => !Equal.equals(values[field], echo.values[field]))',
    'const contradicted: Array<string> = []',
  ),
  edit(
    'a contradicted field is not read again',
    '../src/model.ts',
    'if (requests.every(request => request.fields.length === 0)) return model',
    'return model',
  ),
  // A live patch over a pending write (#498, #499)
  edit(
    'a relative layer resolves over the base its own echo moved',
    '../src/optimistic.ts',
    'overKept(base[key]?.values ?? {}, kept.get(key), layer.id)',
    'base[key]?.values ?? {}',
  ),
  edit(
    'a layer resolves over a value kept for another request (#513)',
    '../src/kept.ts',
    '    const before = by.get(id)\n    if (before === undefined) continue\n',
    '    const before = by.get(id) ?? [...by.values()][0]\n    if (before === undefined) continue\n',
  ),
  edit(
    'a request new to a patched field is kept over the first patch (#513)',
    '../src/liveEvents.ts',
    'by: new Map([...(held?.by ?? []), ...fresh.map(id => [id, before] as const)]),',
    'by: new Map([...(held?.by ?? []), ...fresh.map(id => [id, held?.by.values().next().value ?? before] as const)]),',
  ),
  edit(
    'a later patch replaces the value kept from before the first',
    '../src/liveEvents.ts',
    'const fresh = [...pending].filter(id => held === undefined || !held.by.has(id))',
    'const fresh = [...pending]',
  ),
  edit(
    'a patch is kept with no write pending',
    '../src/liveEvents.ts',
    'const fresh = [...pending].filter(id => held === undefined || !held.by.has(id))',
    "const fresh = [...(pending.size === 0 ? ['x'] : pending)]",
  ),
  edit(
    'a kept value outlives the bound',
    '../src/liveEvents.ts',
    '.filter(([, field]) => field.since > now - echoKept)',
    '.filter(() => true)',
  ),
  edit(
    'an answer leaves the fields it wrote kept',
    '../src/liveEvents.ts',
    '.filter(([field]) => !Object.hasOwn(values, field))',
    '.filter(() => true)',
  ),
  edit(
    'the last write answered leaves what is kept',
    '../src/liveEvents.ts',
    'if (pending.size === 0) return { kept: noKept, again }',
    'if (pending.size === 0) return { kept, again }',
  ),
  edit(
    'a live delete leaves the row kept',
    '../src/liveEvents.ts',
    'kept: withoutRow(kept, key),',
    'kept,',
  ),
  edit(
    'a failure of the last write leaves what is kept',
    '../src/model.ts',
    'kept: mutations.pending.size === 0 ? noKept : model.kept,',
    'kept: model.kept,',
  ),
  edit(
    'an answer is never read again against a newer patch',
    '../src/model.ts',
    'return askedAgain(capabilities, next, again)',
    'return next',
  ),
  edit(
    'an answer that agrees with the stream is read again',
    '../src/liveEvents.ts',
    '      if (Equal.equals(own(store[key]?.values, field), values[field])) continue\n',
    '',
  ),
  edit(
    'an answer is read again for a patch older than its request',
    '../src/liveEvents.ts',
    'if (!held.by.has(requestId) || !Object.hasOwn(values, field)) continue',
    'if (!Object.hasOwn(values, field)) continue',
  ),
  {
    name: 'the visible store is kept by the layers alone, not the kept values',
    edits: [
      {
        file: '../src/layers.ts',
        find: '  let byStore = byKept.get(kept)',
        replace: '  let byStore = byKept.get(optimistic)',
      },
      {
        file: '../src/layers.ts',
        find: '    byKept.set(kept, byStore)',
        replace: '    byKept.set(optimistic, byStore)',
      },
    ],
    tests,
  },
  // Selective refresh
  edit(
    'a refresh restarts every read, not those that cover it',
    '../src/model.ts',
    '  let at = refresh.floor\n',
    '  let at = refresh.generation\n',
  ),
  // Lifecycle
  edit(
    'a read left mid-flight keeps its rows Loading',
    '../src/domain.ts',
    'abandoned: ownedMarks(remote, by).filter(mark => !asking.has(mark)),',
    'abandoned: [],',
  ),
  edit(
    'a left read takes the mark back from another entry still waiting on the row',
    '../src/model.ts',
    'const kept = new Set(message.marks.filter(mark => others.some(([, set]) => set.has(mark))))',
    'const kept = new Set<string>()',
  ),
  edit(
    'a live entry with nothing to watch opens a stream',
    '../src/liveEntry.ts',
    'dependencies.requirements.length === 0 && dependencies.queries.length === 0\n      ? Stream.empty',
    'false\n      ? Stream.empty',
  ),
]
