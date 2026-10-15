/**
 * The command menu, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/command.mutations.ts` checks that a
 * test fails for every one.
 */
const file = '../src/command.ts'
const unit = 'packages/mixins-ui/test/command.test.ts'

export default [
  {
    name: 'a row matching one word of the query stays',
    edits: [{ file, find: 'words.every(word =>', replace: 'words.some(word =>' }],
    tests: [unit],
  },
  {
    name: 'the keys step onto a disabled row',
    edits: [
      {
        file,
        find: 'group.items.filter(item => item.disabled !== true)',
        replace: 'group.items.filter(() => true)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the highlight stays on a row filtered away',
    edits: [
      {
        file,
        find: 'const active = Option.filter(options.active, value => enabled.some(item => item.value === value))',
        replace: 'const active = options.active',
      },
    ],
    tests: [unit],
  },
  {
    name: 'ArrowDown steps up',
    edits: [
      {
        file,
        find: "case 'ArrowDown':\n              return Option.map(step(1), options.onActive)",
        replace: "case 'ArrowDown':\n              return Option.map(step(-1), options.onActive)",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the keys stop at the ends',
    edits: [
      {
        file,
        find: 'enabled[(at + by + enabled.length) % enabled.length]',
        replace: 'enabled[Math.max(0, Math.min(at + by, enabled.length - 1))]',
      },
    ],
    tests: [unit],
  },
  {
    name: 'Enter runs nothing',
    edits: [
      {
        file,
        find: "case 'Enter':\n              return Option.map(current, options.onRun)",
        replace: "case 'Enter':\n              return Option.none()",
      },
    ],
    tests: [unit],
  },
  {
    name: 'every key runs the highlighted row',
    edits: [
      {
        file,
        find: 'default:\n              return Option.none()',
        replace: 'default:\n              return Option.map(current, options.onRun)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'every row reads as selected',
    edits: [{ file, find: 'h.AriaSelected(on),', replace: 'h.AriaSelected(true),' }],
    tests: [unit],
  },
  {
    name: 'a disabled row runs when pressed',
    edits: [{ file, find: '...(disabled\n', replace: '...(false\n' }],
    tests: [unit],
  },
]
