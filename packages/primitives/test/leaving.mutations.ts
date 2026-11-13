/**
 * `Leaving`, broken in turn: `pnpm mutate
 * packages/primitives/test/leaving.mutations.ts` checks that a test fails for
 * every one.
 */
const file = '../src/dom/leaving.ts'
const tests = ['packages/primitives/test/leaving.browser.test.ts']
const writing = ['packages/primitives/test/leaving.test.ts']

const focusThenInert =
  '            const active = doc.activeElement\n' +
  '            if (active !== null && (active === part || part.contains(active))) {\n' +
  '              fallbackFor({\n' +
  '                root: element,\n' +
  '                to: nearest.to,\n' +
  '                next: part.nextSibling,\n' +
  '                previous: part.previousSibling,\n' +
  '                enclosing: part.parentElement,\n' +
  '              })?.focus({ preventScroll: true })\n' +
  '            }\n' +
  '            if (part instanceof HTMLElement) part.inert = true\n'

export default [
  {
    name: 'the marker is written under a name the Mount does not read',
    edits: [{ file, find: "const KEY = 'fk-leaving'", replace: "const KEY = 'fk-left'" }],
    tests: writing,
  },
  {
    name: 'the part becomes inert before focus moves',
    edits: [
      {
        file,
        find: focusThenInert,
        replace:
          '            if (part instanceof HTMLElement) part.inert = true\n' +
          '            const active = doc.activeElement\n' +
          '            if (active !== null && (active === part || part.contains(active))) {\n' +
          '              fallbackFor({\n' +
          '                root: element,\n' +
          '                to: nearest.to,\n' +
          '                next: part.nextSibling,\n' +
          '                previous: part.previousSibling,\n' +
          '                enclosing: part.parentElement,\n' +
          '              })?.focus({ preventScroll: true })\n' +
          '            }\n',
      },
    ],
    tests,
  },
  {
    name: 'unmarking clears an inert the part already had',
    edits: [
      {
        file,
        find: 'if (claim !== undefined && node instanceof HTMLElement) node.inert = claim.inert',
        replace: 'if (node instanceof HTMLElement) node.inert = false',
      },
    ],
    tests,
  },
  {
    name: 'unmarking focuses the part',
    edits: [
      {
        file,
        find: 'if (claim !== undefined && node instanceof HTMLElement) node.inert = claim.inert',
        replace:
          'if (claim !== undefined && node instanceof HTMLElement) {\n' +
          '                node.inert = claim.inert\n' +
          '                node.focus()\n' +
          '              }',
      },
    ],
    tests,
  },
  {
    name: 'showing a parent shows a descendant that is still leaving',
    edits: [
      {
        file,
        find: 'if (node !== root && isLeaving(node)) continue',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'unmarking walks the whole subtree instead of the claims held',
    edits: [
      {
        file,
        find: 'for (const node of held) {',
        replace:
          "for (const node of [root, ...root.querySelectorAll('*')]) { if (!held.has(node)) continue",
      },
    ],
    tests,
  },
  {
    name: 'teardown leaves the observer working',
    edits: [
      {
        file,
        find:
          '          return () => {\n' +
          '            disposed = true\n' +
          '            changes.disconnect()\n' +
          '            containers.delete(element)\n',
        replace: '          return () => {\n' + '            containers.delete(element)\n',
      },
    ],
    tests,
  },
]
