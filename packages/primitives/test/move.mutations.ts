/**
 * Move's Escape and keys, broken in turn: `pnpm mutate
 * packages/primitives/test/move.mutations.ts`.
 */
const dom = '../src/dom/move.ts'
const keys = '../src/interaction/move.ts'
const tests = ['packages/primitives/test/move.test.ts']

export default [
  {
    name: 'Escape does not end a drag',
    edits: [{ file: dom, find: "'keydown',\n", replace: "'keyup',\n" }],
    tests,
  },
  {
    name: 'the document is listened to only from a press',
    edits: [{ file: dom, find: 'session.listen()', replace: '' }],
    tests,
  },
  {
    name: 'Escape completes the drag',
    edits: [
      { file: dom, find: 'end(active.pointerId, false)', replace: 'end(active.pointerId, true)' },
    ],
    tests,
  },
  {
    name: 'a plain arrow nudges',
    edits: [
      {
        file: keys,
        find: "Behaviors.Keys.chord('ArrowUp', { alt: true }),",
        replace: "Behaviors.Keys.chord('ArrowUp'),",
      },
    ],
    tests,
  },
  {
    name: 'Shift does not reach the nudge',
    edits: [
      {
        file: keys,
        find: 'alt: true, meta: false, shift: modifiers.shiftKey',
        replace: 'alt: true, meta: false, shift: false',
      },
    ],
    tests,
  },
  {
    name: 'a resize handle reads every handle’s keys',
    edits: [
      {
        file: keys,
        find: '          handle,\n          options,',
        replace: "          'se',\n          options,",
      },
    ],
    tests,
  },
]
