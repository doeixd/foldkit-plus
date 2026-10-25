/**
 * Invariants a form can judge, each step broken in turn:
 * `pnpm mutate packages/form/test/invariant.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = [
  'packages/entity/test/invariant.test.ts',
  'packages/form/test/invariant.test.ts',
  'packages/crud/test/editor.test.ts',
]
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a key holding nothing is judged as set',
    '../../entity/src/invariant.ts',
    'Option.isOption(given) ? given : Option.fromUndefinedOr(given)',
    'Option.isOption(given) ? Option.some(Option.getOrNull(given)) : Option.fromUndefinedOr(given)',
  ),
  edit(
    'a value is judged unencoded',
    '../../entity/src/invariant.ts',
    'const stored = Option.orElse(encode(given), () => Option.flatMap(held, encode))',
    'const stored = held',
  ),
  edit(
    'a form submits a row that breaks an invariant',
    '../src/index.ts',
    'Option.match(judged(settled, value), {',
    'Option.match(Option.none<Model>(), {',
  ),
  edit(
    'a failure naming no key of the form is shown nowhere',
    '../src/index.ts',
    'if (shown.length === 0) errors.push(failure.message)',
    '',
  ),
  edit(
    'an invariant the save broke is left to the status',
    '../../crud/src/index.ts',
    'if (Refusal.isInvalid(refusal)) {',
    'if (false) {',
  ),
]
