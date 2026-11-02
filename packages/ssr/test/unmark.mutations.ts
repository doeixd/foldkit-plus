/**
 * The served page's markers taken off before adoption, broken in turn:
 * `pnpm mutate packages/ssr/test/unmark.mutations.ts`.
 *
 * `pnpm mutate` runs no e2e file, so the development warning these markers
 * caused (#375) is checked by hand: with `FOLDKIT_MUTATION` set to each of the
 * first four edits (the file as an absolute path) and
 * `FOLDKIT_MUTATION_MARKER` to a scratch file,
 * `examples/foldkit/ssr/e2e/dev.e2e.ts`'s #375 test fails on Foldkit's
 * "server DOM did not match" warning (checked 2026-11-01).
 */
const client = '../src/client.ts'
const tests = ['packages/ssr/test/unmark.test.ts', 'packages/ssr/test/lateCommitClick.test.ts']

export default [
  {
    name: 'the markers are left for Foldkit to find',
    edits: [{ file: client, find: '    unmark(root)\n', replace: '' }],
    tests,
  },
  {
    name: 'the envelope stays on the root',
    edits: [{ file: client, find: '  root.removeAttribute(RESUME_ATTRIBUTE)\n', replace: '' }],
    tests,
  },
  {
    name: "the bindings' markers stay",
    edits: [{ file: client, find: 'name.startsWith(BINDING_ATTRIBUTE) || ', replace: '' }],
    tests,
  },
  {
    name: "a kept field's marker stays",
    edits: [{ file: client, find: ' || name === KEEP_ATTRIBUTE', replace: '' }],
    tests,
  },
  {
    name: "a placement's slot stays",
    edits: [{ file: client, find: ' || name === SLOT_ATTRIBUTE', replace: '' }],
    tests,
  },
  {
    name: "a form keeps the fallback's method",
    edits: [{ file: client, find: "    form?.removeAttribute('method')\n", replace: '' }],
    tests,
  },
  {
    name: 'an event before the first render reads markers the boot took off',
    edits: [
      {
        file: '../src/listen.ts',
        find: 'const tokens = markers.get(node)?.get(type)',
        replace: 'const tokens = node.getAttribute(`${BINDING_ATTRIBUTE}${type}`) ?? undefined',
      },
    ],
    tests,
  },
]
