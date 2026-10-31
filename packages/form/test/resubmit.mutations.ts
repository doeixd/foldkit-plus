/**
 * A submit that changes nothing keeps its Model, broken in turn:
 * `pnpm mutate packages/form/test/resubmit.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = ['packages/form/test/resubmit.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a submit always starts from a copy',
    'cleared && !model.submitPending && model.attempted\n          ? model',
    'false\n          ? model',
  ),
  edit(
    'a first submit is not marked attempted',
    'cleared && !model.submitPending && model.attempted\n          ? model',
    'cleared && !model.submitPending\n          ? model',
  ),
  edit(
    'finishing always copies the Model',
    'const settled: Model = model.submitPending ? { ...model, submitPending: false } : model',
    'const settled: Model = { ...model, submitPending: false }',
  ),
  edit(
    'a valid submit always clears errors into a copy',
    'model: settled.errors.length === 0 ? settled : { ...settled, errors: [] },',
    'model: { ...settled, errors: [] },',
  ),
]
