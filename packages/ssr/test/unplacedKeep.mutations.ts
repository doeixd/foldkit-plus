/**
 * `KeepTyped` on an element `h` builds refused on the server (#371), broken in
 * turn: `pnpm mutate packages/ssr/test/unplacedKeep.mutations.ts` checks that a
 * test fails for each.
 */
const index = '../src/index.ts'
const resumable = '../src/resumable.ts'
const refused = ['packages/ssr/test/keepTypedRefused.test.ts']

export default [
  {
    name: 'a marker no resumable element took is served',
    edits: [
      { file: index, find: '    unkeepable.push(...unplacedKeeps(full.html))\n', replace: '' },
    ],
    tests: refused,
  },
  {
    name: 'the server writes the marker as the browser does',
    edits: [
      {
        file: resumable,
        find: "current()?.mode === 'collect' ? UNPLACED_KEEP : ''",
        replace: "''",
      },
    ],
    tests: refused,
  },
  {
    name: 'the refusal names the tag alone',
    edits: [
      {
        file: index,
        find: '`KeepTyped on ${id === undefined ? tag : `${tag}#${id}`}, which',
        replace: '`KeepTyped on ${tag}, which',
      },
    ],
    tests: refused,
  },
]
