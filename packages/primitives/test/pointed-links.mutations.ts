/**
 * `pointedLinks`, broken in turn:
 * `pnpm mutate packages/primitives/test/pointed-links.mutations.ts` checks
 * that a test fails for every one.
 */
const tests = ['packages/primitives/test/pointed-links.test.ts']
const file = '../src/dom/pointed-links.ts'

export default [
  {
    name: 'a link to another origin is read',
    edits: [{ file, find: ' && link.origin === window.location.origin', replace: '' }],
    tests,
  },
  {
    name: 'each element inside a link reads it again',
    edits: [
      {
        file,
        find: '.pipe(Stream.changesWith((a, b) => urlToString(a) === urlToString(b)))',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a link tabbed to is not read',
    edits: [{ file, find: "type: 'focusin'", replace: "type: 'focusout'" }],
    tests,
  },
  {
    name: 'only the element itself counts, not the link around it',
    edits: [{ file, find: ".closest('a[href]')", replace: '' }],
    tests,
  },
]
