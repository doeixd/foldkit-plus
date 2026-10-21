/**
 * Every tinted hover following `surface.hover`, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/hoverInk.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/mixins-ui/test/hoverInk.browser.test.ts']

export default [
  {
    name: 'Table’s highlight paints with the text alone',
    edits: [
      {
        file: '../src/recipes/table.ts',
        find: '        borderRadius: ref.radius.md,\n        background: unfilledHover,',
        replace: '        borderRadius: ref.radius.md,\n        background: ref.state.hover,',
      },
    ],
    tests,
  },
  {
    name: 'Table’s expand toggle hovers with the text alone',
    edits: [
      {
        file: '../src/recipes/table.ts',
        find: '{ color: ref.text.overt, background: unfilledHover }',
        replace: '{ color: ref.text.overt, background: ref.state.hover }',
      },
    ],
    tests,
  },
  {
    name: 'a filled Segmented’s highlight is the accent’s, whatever the theme’s hover',
    edits: [
      {
        file: '../src/recipes/segmented.ts',
        find: "        background: unfilledHover,\n        opacity: 'var(--fk-segmented-hover-shown)',",
        replace:
          "        background: ref.accent.subtle,\n        opacity: 'var(--fk-segmented-hover-shown)',",
      },
    ],
    tests,
  },
  {
    name: 'pill Tabs’ highlight is the accent’s, whatever the theme’s hover',
    edits: [
      {
        file: '../src/recipes/tabs.ts',
        find: "            background: unfilledHover,\n            opacity: hovered('shown'),",
        replace:
          "            background: ref.accent.subtle,\n            opacity: hovered('shown'),",
      },
    ],
    tests,
  },
  {
    name: 'a plain Segmented option tints nothing',
    edits: [
      {
        file: '../src/recipes/segmented.ts',
        find: '        background: unfilledHover,\n      }),\n      Style.nest(`:where(:not([data-fluid-hover])) > &:not(${pressed})${PRESSED}`,',
        replace:
          "        background: 'transparent',\n      }),\n      Style.nest(`:where(:not([data-fluid-hover])) > &:not(${pressed})${PRESSED}`,",
      },
    ],
    tests,
  },
]
