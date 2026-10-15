/**
 * Toggle buttons and groups, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/toggleButtons.mutations.ts`.
 */
const browser = ['packages/mixins-ui/test/toggleButtons.browser.test.ts']
const recipe = '../src/recipes/button.ts'

export default [
  {
    name: 'an unfilled toggle looks the same on and off',
    edits: [
      {
        file: recipe,
        find: 'const on = (declarations: Declarations): StyleValue =>\n  Style.pseudo(\'[aria-pressed="true"]\', declarations)',
        replace:
          "const on = (declarations: Declarations): StyleValue =>\n  Style.pseudo('[data-never]', declarations)",
      },
    ],
    tests: browser,
  },
  {
    name: 'a solid toggle on looks off',
    edits: [
      { file: recipe, find: "          on({ background: toneVar('fill-active') }),\n", replace: '' },
    ],
    tests: browser,
  },
  {
    name: 'Button.view drops pressed',
    edits: [
      {
        file: '../src/button.ts',
        find: ': [...button, h.AriaPressed(String(options.pressed))],',
        replace: ': button,',
      },
    ],
    tests: ['packages/mixins-ui/test/buttonView.test.ts', ...browser],
  },
  {
    name: 'a single segmented choice can be let go',
    edits: [
      {
        file: '../src/segmented.ts',
        find: 'return options.optional === true ? [] : pressed',
        replace: 'return []',
      },
    ],
    tests: ['packages/mixins-ui/test/segmented.test.ts'],
  },
  {
    name: 'a toggle group keeps one pressed',
    edits: [
      {
        file: '../src/segmented.ts',
        find: 'if (options.multiple === true) return flipped(pressed, value)',
        replace: 'if (options.multiple === true) return [value]',
      },
    ],
    tests: ['packages/mixins-ui/test/segmented.test.ts'],
  },
]
