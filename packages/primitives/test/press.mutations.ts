/**
 * `Press.events`: what an aria-disabled element refuses (a new press) and
 * what it still delivers (the end of a press it heard begin), broken in turn:
 * `pnpm mutate packages/primitives/test/press.mutations.ts`.
 */
const file = '../src/interaction/press.ts'
const tests = [
  'packages/primitives/test/press.test.ts',
  'packages/primitives/test/repeat.browser.test.ts',
]
const unit = ['packages/primitives/test/press.test.ts']

export default [
  {
    name: 'a pointer released after the element disabled is dropped',
    edits: [
      {
        file,
        find: 'if (ending && isDisabled()) offer(Message.PointerCancelled({ pointerId: id }))',
        replace: 'if (isDisabled()) return',
      },
    ],
    tests,
  },
  {
    name: 'a pointer released after the element disabled still presses',
    edits: [
      {
        file,
        find: 'if (ending && isDisabled()) offer(Message.PointerCancelled({ pointerId: id }))',
        replace: 'if (false) offer(Message.PointerCancelled({ pointerId: id }))',
      },
    ],
    tests: unit,
  },
  {
    name: 'a key released after the element disabled is dropped',
    edits: [
      {
        file,
        find: 'if (ending && isDisabled()) offer(Message.KeyCancelled({ key: key.key }))',
        replace: 'if (isDisabled()) return',
      },
    ],
    tests,
  },
  {
    name: 'a key released after the element disabled still activates',
    edits: [
      {
        file,
        find: 'if (ending && isDisabled()) offer(Message.KeyCancelled({ key: key.key }))',
        replace: 'if (false) offer(Message.KeyCancelled({ key: key.key }))',
      },
    ],
    tests: unit,
  },
  {
    name: 'a disabled element takes a new pointer press',
    edits: [
      {
        file,
        find: 'if (isDisabled()) return\n                const pointer = event as PointerLike\n                const pointerId = pointer.pointerId ?? 0\n                began',
        replace:
          'const pointer = event as PointerLike\n                const pointerId = pointer.pointerId ?? 0\n                began',
      },
    ],
    tests: unit,
  },
  {
    name: 'a disabled element takes a key down',
    edits: [
      {
        file,
        find: 'if (isDisabled()) return\n                if (isActivationKey(key.key) && !key.repeat',
        replace: 'if (isActivationKey(key.key) && !key.repeat',
      },
    ],
    tests: unit,
  },
  {
    name: 'a disabled element takes a click',
    edits: [
      {
        file,
        find: 'if (isDisabled()) return\n                const click = event as MouseEvent',
        replace: 'const click = event as MouseEvent',
      },
    ],
    tests: unit,
  },
  {
    name: 'a disabled element hears the end of a press it never heard begin',
    edits: [
      {
        file,
        find: 'else if (!isDisabled()) offer(whenEnabled)',
        replace: 'else offer(whenEnabled)',
      },
    ],
    tests: unit,
  },
  {
    name: 'a pointer press is not remembered',
    edits: [{ file, find: 'began = Option.some(pointerId)', replace: '' }],
    tests,
  },
  {
    name: 'a key press is not remembered',
    edits: [{ file, find: 'beganKey = Option.some(key.key)', replace: '' }],
    tests,
  },
]
