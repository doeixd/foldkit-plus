/**
 * The recipes' look over a real palette, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/recipesLook.mutations.ts` checks that a test fails for every one.
 */
const tests = ['packages/mixins-ui/test/recipes.browser.test.ts']

export default [
  {
    name: 'a neutral switch is on in the pale neutral surface',
    edits: [
      {
        file: '../src/recipes/toggle.ts',
        find: 'neutral: { button: tones.ink },',
        replace: 'neutral: { button: tones.neutral },',
      },
    ],
    tests,
  },
  {
    name: 'a neutral checkbox is checked in the pale neutral surface',
    edits: [
      {
        file: '../src/recipes/toggle.ts',
        find: 'neutral: { checkbox: tones.ink },',
        replace: 'neutral: { checkbox: tones.neutral },',
      },
    ],
    tests,
  },
  {
    name: 'an outlined button draws its line in the fill',
    edits: [
      {
        file: '../src/recipes/button.ts',
        find: "borderColor: toneVar('line'),",
        replace: "borderColor: toneVar('fill'),",
      },
    ],
    tests,
  },
  {
    name: 'a neutral outline draws the faint surface line',
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: '    line: ref.outline.default,\n',
        replace: '    line: ref.surface.default,\n',
      },
    ],
    tests,
  },
  {
    name: 'a chosen pill tab is the base surface',
    edits: [
      {
        file: '../src/recipes/tabs.ts',
        find: 'Style.pseudo(selected, { background: ref.accent.subtle, color: ref.accent.ink }),',
        replace: 'Style.pseudo(selected, { background: ref.surface.base }),',
      },
    ],
    tests,
  },
]
