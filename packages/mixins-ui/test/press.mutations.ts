/**
 * A press being its own state, broken in turn: the film's strength, the
 * shared piece's press rule, the fluid highlight's held rule, and the mark
 * `FluidHover` sets. `pnpm mutate packages/mixins-ui/test/press.mutations.ts`
 * checks that a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/press.browser.test.ts']
const mount = ['packages/primitives/test/fluid-hover.browser.test.ts']

export default [
  {
    name: 'a press is the hover’s strength, not 1.75 of it',
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: "calc(${ref.knob['state-hover']} * 1.75)",
        replace: "${ref.knob['state-hover']}",
      },
    ],
    tests,
  },
  {
    name: 'the shared hover piece presses with the hover’s own declarations',
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: 'Style.pseudo(PRESSED, held(declarations))',
        replace: 'Style.pseudo(PRESSED, declarations)',
      },
    ],
    tests,
  },
  {
    name: 'a fluid highlight ignores the held mark',
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: "Style.nest(':where([data-fluid-held]) > &', {",
        replace: "Style.nest(':where([data-fluid-hover]) > &', {",
      },
    ],
    tests,
  },
  {
    name: 'FluidHover never marks the item its highlight lights as held',
    edits: [
      {
        file: '../../primitives/src/dom/fluid-hover.ts',
        find: '            container.setAttribute(FLUID_HELD_ATTRIBUTE, name)\n',
        replace: '',
      },
    ],
    tests: mount,
  },
]
