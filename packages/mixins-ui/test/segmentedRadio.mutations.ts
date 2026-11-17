/**
 * Segmented as a radio group, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/segmentedRadio.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/segmentedRadio.browser.test.ts']
const file = '../src/segmented.ts'

export default [
  {
    name: 'every option is a tab stop',
    edits: [{ file, find: 'h.Tabindex(index === stop ? 0 : -1)', replace: 'h.Tabindex(0)' }],
    tests,
  },
  {
    name: 'the tab stop ignores the chosen option',
    edits: [
      {
        file,
        find: 'enabled.includes(chosenAt) ? chosenAt : (enabled[0] ?? -1)',
        replace: '(enabled[0] ?? -1)',
      },
    ],
    tests,
  },
  {
    name: 'a disabled option is not skipped by the keys',
    edits: [
      {
        file,
        find: 'off || option.disabled === true ? [] : [index],',
        replace: 'off ? [] : [index],',
      },
    ],
    tests,
  },
  {
    name: 'the keys wrap no more',
    edits: [{ file, find: 'loop: true,', replace: 'loop: false,' }],
    tests,
  },
  {
    name: 'right to left is not read',
    edits: [
      {
        file,
        find: "direction: multiple ? 'ltr' : (options.direction ?? 'ltr'),",
        replace: "direction: 'ltr',",
      },
    ],
    tests,
  },
  {
    name: 'an arrow moves focus but chooses nothing',
    edits: [
      {
        file,
        find: 'Behaviors.Keys.focus(idOf(target.value), options.onPress(target.value))',
        replace:
          'Behaviors.Keys.focus(idOf(target.value), options.onPress(options.pressed[0] ?? target.value))',
      },
    ],
    tests,
  },
  {
    name: 'a disabled group leaves its options on',
    edits: [
      {
        file,
        find: 'const unavailable = off || option.disabled === true',
        replace: 'const unavailable = option.disabled === true',
      },
    ],
    tests,
  },
  {
    name: 'a single choice is drawn as pressed buttons',
    edits: [
      { file, find: "h.Role(multiple ? 'group' : 'radiogroup'),", replace: "h.Role('group')," },
    ],
    tests,
  },
  {
    name: 'the group is not marked disabled',
    edits: [{ file, find: '...(off ? [h.AriaDisabled(true)] : []),', replace: '' }],
    tests,
  },
  {
    name: 'a name submits nothing',
    edits: [
      {
        file,
        find: '...(options.name === undefined ? [] : submitted(options.name)),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the recipe styles only a pressed button as chosen',
    edits: [
      {
        file: '../src/recipes/segmented.ts',
        find: ':is([aria-pressed="true"], [aria-checked="true"])\'',
        replace: '[aria-pressed="true"]\'',
      },
    ],
    tests,
  },
  {
    name: 'the fluid pill measures only a pressed button',
    edits: [
      {
        file,
        find: 'const pressed = \':is([aria-pressed="true"], [aria-checked="true"])\'',
        replace: 'const pressed = \'[aria-pressed="true"]\'',
      },
    ],
    tests,
  },
  {
    name: 'a key moves from the option the last drawing chose, not from where the previous key left off',
    edits: [{ file, find: '          reached = next\n', replace: '' }],
    tests,
  },
  {
    name: 'a key reads the option the last drawing chose',
    edits: [{ file, find: 'enabled, reached, key', replace: 'enabled, chosenAt, key' }],
    tests,
  },
]
