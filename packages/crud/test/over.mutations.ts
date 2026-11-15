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
    '`judged ${member}`,\n                  data.get(selection, target),',
    '`judged ${member}`,\n                  data.get(current, target),',
  ),
  edit(
    'what the invariants read is loaded in the Selection the form fills from',
    'const current = Entity.selectFor(form.input, { also: locks?.select })',
    'const current = Entity.selectFor(form.input, { also: { ...Entity.judgedBy(form.input), ...locks?.select } })',
  ),
  edit(
    'a withheld member is judged as null',
    'Entity.rowFrom(form.input.entity, { ...value, ...held })',
    'Entity.rowFrom(form.input.entity, { ...Object.fromEntries(judgedReads.map(([member]) => [member, null])), ...value, ...held })',
  ),
  edit(
    'the form is not set over the row it is filled from',
    'slice.set(root, { ...editor, ...overOf(root, target, editor.form, value) }),',
    'root,',
  ),
  edit(
    'a judged member arriving after the fill is not taken in',
    'if (Option.exists(editor.judged, judged => held.every(m => judged.includes(m))))',
    'if (Option.isSome(editor.judged))',
  ),
  edit(
    'the judged members the form is over are not recorded, so every sync sets it over again',
    'judged: Option.some(Object.keys(held)),',
    'judged: Option.none(),',
  ),
  edit(
    'the form stays over the row before its own save',
    'onSome: value => overOf(root, editor.target, answered, value),',
    'onSome: () => ({ form: answered }),',
  ),
]
