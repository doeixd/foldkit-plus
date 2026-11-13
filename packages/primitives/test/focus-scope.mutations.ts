/**
 * `FocusScope` while its element is leaving, broken in turn:
 * `pnpm mutate packages/primitives/test/focus-scope.mutations.ts`.
 */
const file = '../src/dom/focus-scope.ts'
const tests = ['packages/primitives/test/focus-scope.test.ts']

export default [
  {
    name: 'a leaving scope still wraps Tab',
    edits: [
      {
        file,
        find:
          '            if (isLeaving(element)) return\n' +
          '            const key = event as KeyboardEvent\n',
        replace: '            const key = event as KeyboardEvent\n',
      },
    ],
    tests,
  },
  {
    name: 'a leaving scope pulls a stray focus back',
    edits: [
      {
        file,
        find:
          '            if (isLeaving(element)) return\n' +
          '            const target = event.target\n',
        replace: '            const target = event.target\n',
      },
    ],
    tests,
  },
  {
    name: 'unmount restores focus a new surface already took',
    edits: [
      {
        file,
        find:
          '            const active = ownerDocument.activeElement\n' +
          '            const lost =\n' +
          '              active === null ||\n' +
          '              active === ownerDocument.body ||\n' +
          '              !ownerDocument.contains(active) ||\n' +
          '              element.contains(active)\n' +
          '            if (lost) previous.focus()\n',
        replace: '            previous.focus()\n',
      },
    ],
    tests,
  },
]
