/**
 * The input mask, broken in turn:
 * `pnpm mutate packages/primitives/test/input-mask.mutations.ts` checks that a
 * test fails for every one.
 */
const source = '../src/dom/input-mask.ts'
const browser = 'packages/primitives/test/input-mask.browser.test.ts'

export default [
  {
    name: 'the caret is put back at the index the browser left in the unmasked text',
    edits: [
      {
        file: source,
        find: 'const at = caretAfter(pattern, masked, consumed)',
        replace: 'const at = Math.min(caret, masked.length)',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a deleted separator is written back, so Backspace on it does nothing',
    edits: [
      {
        file: source,
        find: 'raw === applyMask(before, pattern).raw',
        replace: 'false',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a composition is rewritten while it is still being composed',
    edits: [
      {
        file: source,
        find: 'if (composing || (event as InputEvent).isComposing === true) return',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the caret lands before the typed character it should follow',
    edits: [
      {
        file: source,
        find: 'if (seen === consumed) return i + 1',
        replace: 'if (seen === consumed) return i',
      },
    ],
    tests: [browser],
  },
]
