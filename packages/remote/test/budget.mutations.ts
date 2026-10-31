/**
 * A budget on what retention keeps (#352), broken in turn:
 * `pnpm mutate packages/remote/test/budget.mutations.ts`
 */
const tests = [
  'packages/remote/test/budget.test.ts',
  'packages/remote/test/departed.test.ts',
  'packages/remote/test/heldValue.test.ts',
]
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
const retain = '../src/retain.ts'
const model = '../src/model.ts'
const reasons = '../src/whyReasons.ts'
const index = '../src/index.ts'

export default [
  edit(
    'what is shown costs nothing',
    retain,
    'let spent = walk.held() + active.connections.length',
    'let spent = 0',
  ),
  edit(
    'a list costs nothing of its own',
    retain,
    'let cost = batch.connections.length',
    'let cost = 0',
  ),
  edit(
    'a read whose row is held already costs nothing',
    retain,
    'cost += Math.max(1, walk.held() - before)',
    'cost += walk.held() - before',
  ),
  edit(
    'a key the store does not hold costs an entry',
    retain,
    'if (Object.hasOwn(store, key)) held++',
    'held++',
  ),
  edit(
    'a batch that does not fit leaves older ones kept',
    retain,
    'if (spent + cost > budget) break',
    'if (spent + cost > budget) continue',
  ),
  edit(
    'a Surface shown again stays in the batch it left in',
    retain,
    '.map(batch => without(batch, reads, lists))',
    '.map(batch => batch)',
  ),
  edit(
    'what was just left is not kept',
    retain,
    '[...previous.departed, previous.active]',
    '[...previous.departed]',
  ),
  edit(
    'unchanged roots are new roots',
    retain,
    'recent: unchanged ? previous : { active, departed },',
    'recent: { active, departed },',
  ),
  edit(
    "a pending write's list is kept without its rows",
    retain,
    '    walk.list({ identity: overlay.connection })\n',
    '',
  ),
  edit(
    'a pending write costs nothing',
    retain,
    '  keepPending(walk, state.optimistic, state.mutations.pending)\n',
    '',
  ),
  edit(
    'the budget is none by default',
    model,
    'message.budget ?? defaultBudget',
    'message.budget ?? 0',
  ),
  edit(
    'an evicted list is not remembered',
    model,
    'evicted.connections.map(root => root.identity),',
    '[],',
  ),
  edit(
    'an evicted read is not remembered',
    model,
    'evicted.requirements.map(root => entityKey(root.entity, root.id)),',
    '[],',
  ),
  edit(
    'every evicted list is remembered',
    model,
    'return next.slice(Math.max(0, next.length - EVICTED_KEPT))',
    'return next',
  ),
  edit(
    'a list evicted twice is remembered twice',
    model,
    '[...names.filter(name => !fresh.has(name)), ...fresh]',
    '[...names, ...fresh]',
  ),
  edit(
    'a list invalidated before it loaded is made fresh',
    model,
    '(!stale && (current?.segments.length ?? 0) === 0)',
    '(!stale && current === undefined)',
  ),
  edit(
    'why says no list was evicted',
    reasons,
    'connection === undefined && remote.evicted.connections.includes(identity)',
    'false',
  ),
  edit(
    'why says a held row was evicted',
    reasons,
    'entry === undefined && remote.evicted.rows.includes(key)',
    'remote.evicted.rows.includes(key)',
  ),
  edit("Remote.make's budget is dropped", index, 'budget: config.budget,', ''),
  edit(
    "Remote.retain's budget is dropped",
    index,
    'toMessage(retentionChanged(current, budget))',
    'toMessage(retentionChanged(current, undefined))',
  ),
  edit('a budget that is no number passes', index, '!(budget >= 0)', 'budget < 0'),
]
