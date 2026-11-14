/**
 * `FocusRecovery` and `FollowTabStop`'s ownership, broken in turn:
 * `pnpm mutate packages/primitives/test/focus-recovery.mutations.ts` checks
 * that a test fails for every one.
 */
const source = '../src/dom/focus-recovery.ts'
const follow = '../src/dom/follow-tab-stop.ts'
const browser = 'packages/primitives/test/focus-recovery.browser.test.ts'
const followTest = 'packages/primitives/test/follow-tab-stop.browser.test.ts'

export default [
  {
    name: 'it acts when focus has moved elsewhere (a dialog the action opened)',
    edits: [
      {
        file: source,
        find: '!element.isConnected || !lost(now.focused)',
        replace: '!element.isConnected',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the outer owner decides while the inner one is still standing',
    edits: [
      {
        file: source,
        find: 'now.chain.slice(0, mine).some(inner => inner.isConnected)',
        replace: 'false',
      },
    ],
    tests: [browser],
  },
  {
    name: 'it focuses without preventScroll',
    edits: [
      {
        file: source,
        find: 'target.focus({ preventScroll: true })',
        replace: 'target.focus()',
      },
    ],
    tests: [browser],
  },
  {
    name: 'it never scrolls the target to the nearest edge',
    edits: [
      {
        file: source,
        find: "target.scrollIntoView({ block: 'nearest', inline: 'nearest' })",
        replace: 'void 0',
      },
    ],
    tests: [browser],
  },
  {
    name: 'it finds a part again through a selector built from its key',
    edits: [
      {
        file: source,
        find: "part => markOf(part, 'part') === slot && markOf(part, 'key') === key,",
        replace: 'part => part.matches(`[data-fk-focus-key="${key}"]`),',
      },
    ],
    tests: [browser],
  },
  {
    name: 'it keeps listening after release (the observer)',
    edits: [{ file: source, find: 'changes.disconnect()', replace: 'void 0' }],
    tests: [browser],
  },
  {
    name: 'it keeps listening after release (focusin)',
    edits: [
      { file: source, find: "element.removeEventListener('focusin', entered)", replace: 'void 0' },
    ],
    tests: [browser],
  },
  {
    name: 'it keeps listening after release (focusout)',
    edits: [
      { file: source, find: "element.removeEventListener('focusout', left)", replace: 'void 0' },
    ],
    tests: [browser],
  },
  {
    name: 'it keeps listening after release (the unrecovered event)',
    edits: [
      { file: source, find: 'element.removeEventListener(UNRECOVERED, passed)', replace: 'void 0' },
    ],
    tests: [browser],
  },
  {
    name: 'it does not see a part moved in the tree as gone',
    edits: [
      {
        file: source,
        find: 'Array.from(record.removedNodes).some(node => node.contains(now.focused))',
        replace: 'false',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a failed recovery is kept as a claim for a later change',
    edits: [
      {
        file: source,
        find: '            held = undefined\n            const steps',
        replace: '            const steps',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a blur the user made leaves the claim in place',
    edits: [
      {
        file: source,
        find: 'now.focused.ownerDocument.activeElement !== now.focused\n                ) {\n                  held = undefined',
        replace:
          'now.focused.ownerDocument.activeElement !== now.focused\n                ) {\n                  void 0',
      },
    ],
    tests: [browser],
  },
  {
    name: 'next goes backwards',
    edits: [
      {
        file: source,
        find: "step === 'next'\n                      ?",
        replace: "step !== 'next'\n                      ?",
      },
    ],
    tests: [browser],
  },
  {
    name: 'an owner with nothing left does not pass it outward',
    edits: [
      {
        file: source,
        find: 'element.dispatchEvent(new CustomEvent(UNRECOVERED, { bubbles: true }))',
        replace: 'void 0',
      },
    ],
    tests: [browser],
  },
  {
    name: "focus inside a nested owner is not the outer owner's part",
    edits: [
      {
        file: source,
        find: 'while (part !== null && !owns(element, part)) {',
        replace: 'while (false) {',
      },
    ],
    tests: [browser],
  },
  {
    name: "FollowTabStop takes a nested widget's stop (B2c)",
    edits: [
      {
        file: follow,
        find: 'stop => ownerAbove(stop) === element',
        replace: 'stop => stop !== null',
      },
    ],
    tests: [followTest],
  },
] as const
