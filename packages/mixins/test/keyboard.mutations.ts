const file = '../src/keyboard.ts'
const tests = ['packages/mixins/test/keyboard.test.ts']

export default [
  {
    name: 'every key takes the native path',
    edits: [{ file, find: 'byKey.get(key)?.get(mask(modifiers))', replace: 'undefined' }],
    tests,
  },
  {
    name: 'Shift is ignored when choosing a route',
    edits: [{ file, find: '(modifiers.shiftKey ? 1 : 0)', replace: '0' }],
    tests,
  },
  {
    name: 'overlapping routes are admitted',
    edits: [{ file, find: 'if (owner !== undefined) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'a keyboard owner ignores its name',
    edits: [{ file, find: "name: options.name ?? 'Keyboard'", replace: "name: 'Keyboard'" }],
    tests,
  },
]
