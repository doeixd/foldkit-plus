/**
 * A lazy bundle's arrival is drawn (#501) and a failed load is no crash
 * (#502), each fix undone: `pnpm mutate packages/bundle/test/lazy.mutations.ts`.
 */
const tests = ['packages/bundle/test/lazy.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/lazy.ts', find, replace }],
  tests,
})

export default [
  edit(
    'an arrival over a drawn placeholder hands back the Model it was given',
    '!drawnPlaceholder.delete(given)) return step',
    'true) return step',
  ),
  edit(
    'the placeholder is never remembered as drawn',
    'drawnPlaceholder.add(args[0])',
    'void args[0]',
  ),
  edit(
    'a failed load is a defect, which crashes the application',
    'Effect.tryPromise(start).pipe(',
    'Effect.promise(start).pipe(',
  ),
  edit(
    'a failed load is remembered, so the next Message awaits the same rejection',
    'loading = undefined\n        throw error',
    'throw error',
  ),
  edit(
    'a kept drawing ignores that the bodies arrived',
    'drawEpochs.set(view, () => body !== undefined)',
    'void view',
  ),
  edit(
    'the arrival copy of an instance Model is a plain object',
    'Object.create(Object.getPrototypeOf(given), Object.getOwnPropertyDescriptors(given))',
    '{ ...given }',
  ),
]
