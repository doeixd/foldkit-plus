/**
 * An editor judging invariants over the row it loaded, each step broken in
 * turn: `pnpm mutate packages/crud/test/over.mutations.ts`.
 */
const tests = ['packages/crud/test/over.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/index.ts', find, replace }],
  tests,
})

export default [
  edit(
    'what the invariants read is not loaded',
    'also: { ...Entity.judgedBy(form.input), ...locks?.select },',
    'also: locks?.select,',
  ),
  edit(
    'the form is not set over the row it is filled from',
    'form: form.over(form.fill(editor.form, values).model, rowOf(value)).model,',
    'form: form.fill(editor.form, values).model,',
  ),
  edit(
    'the form stays over the row before its own save',
    'onSome: value => form.over(answered, rowOf(value)).model,',
    'onSome: () => answered,',
  ),
]
