/**
 * The theme studio's update, broken in turn:
 * `pnpm mutate examples/design-system/test/theme.mutations.ts`.
 */
const unit = ['examples/design-system/test/design-system.test.ts']

export default [
  {
    name: 'picking a theme leaves the tweaks over it',
    edits: [
      {
        file: '../src/main.ts',
        find: '              tweaks: () => noTweaks,\n              status: () => `${titled(name)} theme applied`,',
        replace: '              status: () => `${titled(name)} theme applied`,',
      },
    ],
    tests: unit,
  },
  {
    name: 'a tweak set to the value it holds changes the Model',
    edits: [
      {
        file: '../src/tweaks.ts',
        find: '  Option.exists(tweaks[name], current => current === value) ? tweaks : setters[name](tweaks, value)',
        replace: '  setters[name](tweaks, value)',
      },
    ],
    tests: unit,
  },
  {
    name: 'another tab choosing the shown theme applies it again',
    edits: [
      {
        file: '../src/main.ts',
        find: '    ThemeChangedElsewhere: ({ name }) =>\n      name === model.theme\n        ? { model }',
        replace: '    ThemeChangedElsewhere: ({ name }) =>\n      false\n        ? { model }',
      },
    ],
    tests: unit,
  },
  {
    name: 'the tweak that is unset still writes a knob',
    edits: [
      {
        file: '../src/tweaks.ts',
        find: '      onNone: () => [],',
        replace: '      onNone: () => [`--fk-knob-${tweakKnobs[name].variable}:0`],',
      },
    ],
    tests: unit,
  },
]
