/**
 * The Button's press and toggle looks, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/buttonLook.mutations.ts`.
 */
const tests = ['packages/mixins-ui/test/toggleButtons.browser.test.ts']
const recipe = '../src/recipes/button.ts'

export default [
  {
    name: 'the accent tone has no active fill',
    edits: [
      {
        file: '../src/recipes/design.ts',
        find: '    fillActive: ref.accent.active,\n',
        replace: '    fillActive: ref.accent.hover,\n',
      },
    ],
    tests,
  },
  {
    name: 'a toggle that is on is only tinted',
    edits: [
      {
        file: recipe,
        find: "on({ background: toneVar('fill'), color: toneVar('on-fill') }),",
        replace: "on({ background: unfilledHover, color: toneVar('ink') }),",
      },
    ],
    tests,
  },
  {
    name: 'hovering a toggle that is on drops its fill',
    edits: [
      {
        file: recipe,
        find: "Style.pseudo(onHovered, { background: toneVar('fill-hover'), color: toneVar('on-fill') }),",
        replace:
          "Style.pseudo(onHovered, { background: unfilledHover, color: toneVar('on-fill') }),",
      },
    ],
    tests,
  },
  {
    name: 'a pressed icon toggle’s glyph changes color hovered',
    edits: [
      {
        file: recipe,
        find: "Style.pseudo(onHovered, { background: toneVar('fill-hover'), color: toneVar('on-fill') }),",
        replace: "Style.pseudo(onHovered, { background: toneVar('fill-hover') }),",
      },
    ],
    tests,
  },
  {
    name: 'a held toggle that is on takes the plain press film',
    edits: [
      {
        file: recipe,
        find: "  Style.pseudo(onHeld, { background: toneVar('fill-active'), color: toneVar('on-fill') }),\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a held unfilled button looks like a hovered one',
    edits: [
      {
        file: recipe,
        find: "  background: `color-mix(in oklab, ${toneVar('ink')} 16%, transparent)`,",
        replace: '  background: unfilledHover,',
      },
    ],
    tests,
  },
  {
    name: 'a solid toggle that is on looks hovered',
    edits: [
      {
        file: recipe,
        find: "on({ background: toneVar('fill-active') }),",
        replace: "on({ background: toneVar('fill-hover') }),",
      },
    ],
    tests,
  },
  {
    name: 'a solid toggle that is on lightens hovered, as one that is off',
    edits: [
      {
        file: recipe,
        find: "          Style.pseudo(onHovered, { background: toneVar('fill-active') }),\n",
        replace: '',
      },
    ],
    tests,
  },
]
