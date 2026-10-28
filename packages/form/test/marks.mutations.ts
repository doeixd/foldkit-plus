/**
 * Marks (an invariant's or a refusal's failure on a key), broken in turn:
 * `pnpm mutate packages/form/test/marks.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = [
  'packages/form/test/invariant.test.ts',
  'packages/form/test/refused.test.ts',
  'packages/crud/test/editor.test.ts',
]
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'an edit keeps the marks',
    `const edited = (model: Model): Model => ({
      ...model,
      errors: [],
      marks: {},`,
    `const edited = (model: Model): Model => ({
      ...model,
      errors: [],`,
  ),
  edit(
    'a refusal lands on whatever the key holds',
    'if (!holds || marked.includes(message.error)) return { model }',
    'if (marked.includes(message.error)) return { model }',
  ),
  edit(
    'a refusal lands again beside itself',
    'if (!holds || marked.includes(message.error)) return { model }',
    'if (!holds) return { model }',
  ),
  edit(
    'a second failure on a key replaces the first',
    'else held.push(failure.message)',
    'else marks.set(key, [failure.message])',
  ),
  edit(
    'a view is not shown the marks',
    'if (!Arr.isReadonlyArrayNonEmpty(marked)) return field',
    'return field',
  ),
  edit(
    'a submit goes out past the marks',
    'acceptable(model) && !hasMarks(model) ? nestedValues(model) : undefined',
    'acceptable(model) ? nestedValues(model) : undefined',
  ),
]
