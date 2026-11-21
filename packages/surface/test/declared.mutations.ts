/**
 * `foldkit-surface/declared` mutations:
 * `pnpm mutate packages/surface/test/declared.mutations.ts`
 */
const tests = ['packages/surface/test/declared.test.ts']

const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/declared.ts', find, replace }],
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
    '    if (fallback !== undefined) {\n      return fallback(model, message as Exclude<Message, { readonly _tag: Tag }>)\n    }',
    '    if (false) {}',
  ),
  edit(
    'emitted commands are dropped',
    '      if (emitted.length === 0) return { model: next }',
    '      if (true) return { model: next }',
  ),
]
