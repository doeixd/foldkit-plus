/**
 * The surface ladder, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/raise.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/raise.browser.test.ts']
const raise = '../../mixins/src/theme/raise.ts'

export default [
  {
    name: 'each depth reads its own shallower depth, not its ancestor’s',
    edits: [{ file: raise, find: '`--_fk-depth-${shallower + 1}:inherit;`', replace: "''" }],
    tests,
  },
  {
    name: 'a dark level is no lighter than the one below it',
    edits: [
      {
        file: raise,
        find: 'calc(l + var(${VAR_PREFIX}-knob-raise-dark) * ${above})',
        replace: 'calc(l + 0 * ${above})',
      },
    ],
    tests,
  },
  {
    name: 'a light level keeps stepping toward white past the second',
    edits: [{ file: raise, find: 'min(${above}, 2) / 2', replace: '${above} / 14' }],
    tests,
  },
  {
    name: 'a popup inside a dialog is not raised',
    edits: [
      {
        file: '../src/recipes/popup.ts',
        find: "  Style.pseudo(':focus-visible', { outline: 'none' }),\n  raise(2),",
        replace: "  Style.pseudo(':focus-visible', { outline: 'none' }),",
      },
    ],
    tests,
  },
]
