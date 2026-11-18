/**
 * The gallery card's bound, broken in turn. `e2e/gallery.e2e.ts` drives the dev
 * server, which `pnpm mutate` does not run, so each is run by hand: set
 * `FOLDKIT_MUTATION` (this entry's `edits` as JSON) and `FOLDKIT_MUTATION_MARKER`
 * (a file), then `vitest run --config vitest.e2e.config.ts examples/site/e2e/gallery.e2e.ts`;
 * the e2e server takes the edits through `mutation()`.
 */
const file = '../src/style.ts'
const tests = ['examples/site/e2e/gallery.e2e.ts']

export default [
  {
    name: 'a thumbnail is no longer bounded in height',
    edits: [{ file, find: "maxBlockSize: '22rem',", replace: '' }],
    tests,
  },
  {
    name: 'a thumbnail no longer clips what does not fit',
    edits: [
      {
        file,
        find: "minBlockSize: '11rem',\n        padding: t.space.lg,\n        overflow: 'hidden',",
        replace: "minBlockSize: '11rem',\n        padding: t.space.lg,",
      },
    ],
    tests,
  },
]
