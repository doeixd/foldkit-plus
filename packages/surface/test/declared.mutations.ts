/**
 * `foldkit-surface/declared` mutations:
 * `pnpm mutate packages/surface/test/declared.mutations.ts`
 */
const tests = ['packages/surface/test/declared.test.ts']

const edit = (name: string, find: string, replace: string, file = '../src/declared.ts') => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'declared.update does not wrap rawUpdate in writes.track',
    '  const update = writes.track(rawUpdate)',
    '  const update = rawUpdate',
  ),
  edit(
    'sends validation accepts prototype/unknown Message tags',
    '      if (!Object.hasOwn(messages, target) || messageTag(messages[target]) !== target) {',
    '      if (false) {',
  ),
  edit(
    'undeclared Messages skip fallback and return model unchanged',
    'isUndeclared(message) && fallback !== undefined ? fallback(model, message) : { model }',
    '{ model }',
  ),
  edit(
    'emitted commands are dropped',
    '    if (emitted.length === 0) return { model: next }',
    '    if (true) return { model: next }',
  ),
  edit(
    'a record with no handler is not reported',
    '      if (!Object.hasOwn(commandsTable, recordTag)) {',
    '      if (false) {',
  ),
  edit('step is the tracked update', '    step: rawUpdate,', '    step: update,'),
  edit(
    'a missing fallback is not refused at definition time',
    '  if (undeclared.length > 0 && fallback === undefined) {',
    '  if (false) {',
  ),
  edit(
    'supply is never asked, so the step runs without its values',
    "    if (typeof supplier !== 'function') return run(model, tag, message, Option.none())",
    '    if (true) return run(model, tag, message, Option.none())',
  ),
  edit(
    'a step’s supplied values are not recorded',
    '    if (record !== undefined && isSuppliedStep(step)) record(step)\n',
    '',
  ),
  edit(
    'a replay asks supply for new values',
    '    run(model, step.message._tag, step.message, Option.some(step.supplied))',
    '    declaredStep(model, step.message._tag, step.message)',
  ),
  edit(
    'a missing supply entry is not refused at definition time',
    '    if (declaresSupplied(transition) && !Object.hasOwn(supplyTable, tag)) {',
    '    if (false) {',
  ),
  edit(
    'an edge is drawn to every Message any record sends',
    'Object.hasOwn(validatedSends, emit) ? (validatedSends[emit] ?? []) : []',
    'Object.values(validatedSends).flat()',
  ),
  edit(
    'a contract’s slice is merged into the writes of a Message that has a transition',
    '    if (transitionTags.has(tag)) {',
    '    if (false) {',
    '../src/writes.ts',
  ),
  edit(
    'a Message outside the owner’s messages may write the path it owns',
    '    const foreign = owners.filter(entry => !entry.messages.has(tag))',
    '    const foreign: typeof owners = []',
    '../src/writesCheck.ts',
  ),
  edit(
    'sends keyed by a record no transition emits is accepted',
    '    if (!emittedTags.has(emitTag)) {',
    '    if (false) {',
  ),
]
