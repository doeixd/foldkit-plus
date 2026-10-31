/**
 * A fallback form adopted as the browser draws it, broken in turn:
 * `pnpm mutate packages/ssr/test/fallbackAdoption.mutations.ts`.
 */
const file = '../src/client.ts'
const tests = ['packages/ssr/test/fallbackAdoption.test.ts']

export default [
  {
    name: 'the fallback is left in the forms Foldkit adopts',
    edits: [{ file, find: '    unpost(root)\n', replace: '' }],
    tests,
  },
  {
    name: "a form keeps the fallback's method",
    edits: [{ file, find: "    form?.removeAttribute('method')\n", replace: '' }],
    tests,
  },
]
