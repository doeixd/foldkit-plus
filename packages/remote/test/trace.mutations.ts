/**
 * `Trace`, broken in turn, and the list rule it was built to check:
 * `pnpm mutate packages/remote/test/trace.mutations.ts`
 */
const tests = ['packages/remote/test/trace.test.ts', 'packages/remote/test/departed.test.ts']
const edit = (name: string, find: string, replace: string, file = '../src/testing.ts') => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a stream never restarts',
    'if (current !== undefined && equivalences.get(key)!(current.dependencies, dependencies)) {',
    'if (current !== undefined) {',
  ),
  edit(
    'a stream restarts on every Message',
    'if (current !== undefined && equivalences.get(key)!(current.dependencies, dependencies)) {',
    'if (current === undefined) {',
  ),
  edit(
    'an abandoned request stays held',
    'if (at >= 0) held.splice(at, 1)',
    'if (at < 0) held.splice(at, 1)',
  ),
  edit('no Command runs', 'if (isRemoteCommand(command.name)) {', 'if (false) {'),
  edit('a skipped Command is not recorded', 'skipped.push(command.name)', ''),
  edit(
    'a defect passes quietly',
    '!Cause.hasInterruptsOnly(exit.cause)) defects.push(exit.cause)',
    '!Cause.hasInterruptsOnly(exit.cause)) void exit',
  ),
  edit('no wait ends', 'Duration.isZero(duration) ? Effect.void : Effect.never', 'Effect.never'),
  edit(
    'a failure a step names is answered',
    'onSome: error => Effect.fail(error),',
    'onSome: () => request.ask(config.client),',
  ),
  edit(
    'a step answers the oldest request of any kind',
    'const found = held.find(request => request.keys.has(key))',
    'const found = held[0]',
  ),
  edit(
    'an answer’s Messages wait for the next step',
    '    request.resume(exit)\n    settle()\n    drain()',
    '    request.resume(exit)\n    settle()',
  ),
  edit(
    'Respond.all answers one request',
    'for (let answered = 0; held.length > 0; answered++) {',
    'for (let answered = 0; answered < 1 && held.length > 0; answered++) {',
  ),
  edit('tags repeat', 'if (tags.at(-1) !== tag) tags.push(tag)', 'tags.push(tag)'),
  edit(
    'a failure that keeps its value regresses',
    'Failed: (_, previous) => Option.isSome(previous),',
    'Failed: () => false,',
  ),
  edit('a row found gone regresses', 'NotFound: () => true,', 'NotFound: () => false,'),
  edit(
    'regressions compare a Model with itself',
    'const before = at === 0 ? trace.start : trace.entries[at - 1]!.model',
    'const before = entry.model',
  ),
  edit(
    'a list with a row not yet read reads Loading (#243)',
    '                missing = true\n                continue',
    '                return undefined',
    '../src/index.ts',
  ),
]
