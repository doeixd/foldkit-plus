/**
 * A disagreement failing a test (#350), broken in turn:
 * `pnpm mutate packages/remote/test/disagreements.mutations.ts`.
 */
const tests = ['packages/remote/test/disagreements.test.ts']
const levels = ['packages/remote/test/verifyPredictions.test.ts']

const edit = (name: string, file: string, find: string, replace: string, named = tests) => ({
  name,
  edits: [{ file, find, replace }],
  tests: named,
})
const diagnostics = (name: string, find: string, replace: string, named = tests) =>
  edit(name, '../src/diagnostics.ts', find, replace, named)
const index = (name: string, find: string, replace: string) =>
  edit(name, '../src/index.ts', find, replace)
const testing = (name: string, find: string, replace: string) =>
  edit(name, '../src/testing.ts', find, replace)

export default [
  diagnostics('a mismatch is a warning', "  level: 'error',", "  level: 'warning',", levels),
  diagnostics(
    'an expected part may name what the domain lacks',
    'if (!registered[kind].has(name))',
    'if (false)',
  ),
  diagnostics(
    'an expected part needs no reason',
    "typeof reason !== 'string' || reason.trim() === ''",
    "typeof reason !== 'string'",
  ),
  diagnostics('the object form is on whatever it says', '    on: verify.on,', '    on: true,'),
  index(
    'an expected Value or Gap is recorded',
    '].filter(found => !verify.expects(found.part._tag, mutation))',
    ']',
  ),
  index(
    'an expected Placement is checked',
    '        verify.on &&\n        !verify.expects(',
    '        verify.on ||\n        !verify.expects(',
  ),
  testing(
    'a domain that writes need not verify',
    'if (!Data.verifiesPredictions && Data.registry.mutations.size > 0)',
    'if (false)',
  ),
  testing('a domain that writes nothing must verify', ' && Data.registry.mutations.size > 0)', ')'),
  testing('a disagreement fails nothing', 'if (lines.length > 0)', 'if (false)'),
  testing(
    'a mismatch is counted again at every Model that still holds it',
    "diagnostic._tag === 'PredictionMismatch' && !known.has(diagnostic)",
    "diagnostic._tag === 'PredictionMismatch'",
  ),
  testing(
    'a read that changed its tag for a reason fails',
    'step => step.regression && regresses[step.read] === undefined',
    'step => regresses[step.read] === undefined',
  ),
  testing(
    'a regression the test explains still fails',
    'step => step.regression && regresses[step.read] === undefined',
    'step => step.regression',
  ),
  testing(
    'a recording starts at the newest Model',
    'if (Option.isNone(start)) start = Option.some(model)',
    'start = Option.some(model)',
  ),
  testing('a recording keeps no history', 'history.push({ message, model: result.model })', ''),
]
