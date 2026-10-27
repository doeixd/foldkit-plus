/**
 * `pointedLinks`, broken in turn:
 * `pnpm mutate packages/primitives/test/pointed-links.mutations.ts` checks
 * that a test fails for every one.
 */
const unit = ['packages/primitives/test/pointed-links.test.ts']
const tests = [
  ...unit,
  'packages/primitives/test/pointed-links.browser.test.ts',
  'packages/primitives/test/pointed-links.touch.browser.test.ts',
]
const file = '../src/dom/pointed-links.ts'

export default [
  {
    name: 'a link to another origin is read',
    edits: [{ file, find: ' && link.origin === window.location.origin', replace: '' }],
    tests: unit,
  },
  {
    name: 'only the element itself counts, not the link around it',
    edits: [{ file, find: ".closest('a[href]')", replace: '' }],
    tests,
  },
  {
    name: 'each element inside a link reads it again',
    edits: [{ file, find: '          if (link.href === on) return\n', replace: '' }],
    tests,
  },
  {
    name: 'leaving for an element inside the link leaves it',
    edits: [
      { file, find: 'if (related instanceof Node && link.contains(related)) return', replace: '' },
    ],
    tests,
  },
  {
    name: 'leaving a link does not cancel its wait',
    edits: [
      {
        file,
        find: '            on = undefined\n            clearTimeout(waiting)\n            return',
        replace: '            on = undefined\n            return',
      },
    ],
    tests,
  },
  {
    name: 'a new link does not replace the wait for the last',
    edits: [
      {
        file,
        find: '          on = link.href\n          clearTimeout(waiting)\n',
        replace: '          on = link.href\n',
      },
    ],
    tests,
  },
  {
    name: 'a link counts the moment it is pointed at',
    edits: [
      {
        file,
        find: 'setTimeout(() => Queue.offerUnsafe(queue, url.value), REST)',
        replace: 'Queue.offerUnsafe(queue, url.value)',
      },
    ],
    tests,
  },
  {
    name: 'a finger waits as a mouse does',
    edits: [{ file, find: "event.pointerType === 'touch'", replace: 'false' }],
    tests,
  },
  {
    name: 'a link tabbed to is not read',
    edits: [
      {
        file,
        find: "const LISTENED = ['pointerover', 'pointerout', 'focusin', 'focusout']",
        replace: "const LISTENED = ['pointerover', 'pointerout', 'focusout']",
      },
    ],
    tests,
  },
]
