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
    'a live entry with nothing to watch opens a stream',
    '../src/liveEntry.ts',
    'dependencies.requirements.length === 0 && dependencies.queries.length === 0\n      ? Stream.empty',
    'false\n      ? Stream.empty',
  ),
]
