/**
 * Hotkey matching across platforms, layouts and typing, broken in turn: `pnpm
 * mutate packages/primitives/test/hotkeys.mutations.ts`.
 */
const file = '../src/events/hotkeys.ts'
const tests = [
  'packages/primitives/test/hotkeys.test.ts',
  'packages/primitives/test/keyboard.test.ts',
]

export default [
  {
    name: 'mod is Control on a Mac',
    edits: [
      {
        file,
        find: "named === 'mod' ? (isApple(platform) ? 'meta' : 'ctrl') : named",
        replace: "named === 'mod' ? 'ctrl' : named",
      },
    ],
    tests,
  },
  {
    name: 'iOS is not Apple',
    edits: [
      {
        file,
        find: "platform === 'mac' || platform === 'ios'",
        replace: "platform === 'mac'",
      },
    ],
    tests,
  },
  {
    name: 'the physical key is never consulted',
    edits: [{ file, find: 'return press.code === (', replace: 'return false && press.code === (' }],
    tests,
  },
  {
    name: 'the physical key wins over a Latin letter the layout typed',
    edits: [{ file, find: 'if (letterOrDigit.test(typed)) return false', replace: '' }],
    tests,
  },
  {
    name: 'a digit is read as a letter key',
    edits: [
      {
        file,
        find: '/\\d/.test(chord.key) ? `Digit${chord.key}`',
        replace: 'false ? `Digit${chord.key}`',
      },
    ],
    tests,
  },
  {
    name: 'typing in a field never blocks a shortcut',
    edits: [
      {
        file,
        find: '(press.typing !== true || options.allowInInput === true || hasCommandModifier(chord))',
        replace: 'true',
      },
    ],
    tests,
  },
  {
    name: 'a command modifier does not run while typing',
    edits: [
      {
        file,
        find: 'options.allowInInput === true || hasCommandModifier(chord)',
        replace: 'options.allowInInput === true',
      },
    ],
    tests,
  },
  {
    name: 'allowInInput is ignored',
    edits: [{ file, find: 'options.allowInInput === true ||', replace: 'false ||' }],
    tests,
  },
  {
    name: 'the display drops the isolate',
    edits: [{ file, find: 'return `\\u2066${text}\\u2069`', replace: 'return text' }],
    tests,
  },
  {
    name: 'a Mac shows names, not glyphs',
    edits: [{ file, find: 'isApple(platform)\n      ?', replace: 'false\n      ?' }],
    tests,
  },
  {
    name: 'a pattern reads an inherited name',
    edits: [
      {
        file,
        find: 'const name = keyNames.get(key) ?? key',
        replace:
          'const name = (Object.fromEntries(keyNames) as Record<string, string>)[key] ?? key',
      },
    ],
    tests,
  },
  {
    name: 'an IME press is reported',
    edits: [
      {
        file: '../src/events/keyboard.ts',
        find: 'if (event.isComposing || event.keyCode === 229) return',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a button counts as a field',
    edits: [{ file: '../src/events/keyboard.ts', find: "  'button',\n", replace: '' }],
    tests,
  },
]
