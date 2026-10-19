/**
 * The spinner, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/spinner.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = ['packages/mixins-ui/test/spinner.test.ts']
const browser = ['packages/mixins-ui/test/spinner.browser.test.ts']
const view = '../src/spinner.ts'
const recipe = '../src/recipes/spinner.ts'

export default [
  {
    name: 'a shown label is said twice',
    edits: [
      {
        file: view,
        find: "return h.div(builders.root.attrs([h.Role('status')]), [",
        replace: "return h.div(builders.root.attrs([h.Role('status'), h.AriaLabel(label)]), [",
      },
    ],
    tests: unit,
  },
  {
    name: 'the wheel beside the words is read too',
    edits: [
      {
        file: view,
        find: 'h.span(builders.wheel.attrs([h.AriaHidden(true)]), parts),',
        replace: 'h.span(builders.wheel.attrs(), parts),',
      },
    ],
    tests: unit,
  },
  {
    name: 'the movement ignores travel',
    edits: [
      {
        file: recipe,
        find: 'const cycle = travelled(period)',
        replace: 'const cycle = period',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'the parts move together',
    edits: [
      {
        file: recipe,
        find: "    Style.nest('&:nth-child(2)', { animationDelay: `calc(${cycle} / -3 * 2)` }),\n",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'the wheel turns under reduced motion',
    edits: [
      {
        file: recipe,
        find: '  wheel: variant(...wheel, still),',
        replace: '  wheel: variant(...wheel),',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'the ring draws its parts too',
    edits: [
      {
        file: recipe,
        find: '        [hidden],\n      ),\n      dots:',
        replace: '        [],\n      ),\n      dots:',
      },
    ],
    tests: browser,
  },
  {
    name: 'an orbit draws every part',
    edits: [
      { file: recipe, find: "          Style.nest('& + &', { display: 'none' }),\n", replace: '' },
    ],
    tests: browser,
  },
  {
    name: 'the orbiting dot sits inside the track',
    edits: [
      {
        file: recipe,
        find: 'insetBlockStart: `calc(-1 * ${ref.border.thick} / 2 - 12.5%)`,',
        replace: "insetBlockStart: '0',",
      },
    ],
    tests: browser,
  },
  {
    name: 'a large spinner is the default size',
    edits: [
      {
        file: recipe,
        find: "lg: { wheel: variant(Style.self({ '--_fk-spinner-size': '2rem' })) },",
        replace: "lg: { wheel: variant(Style.self({ '--_fk-spinner-size': '1.5rem' })) },",
      },
    ],
    tests: browser,
  },
  {
    name: 'the current tone is the accent',
    edits: [
      {
        file: recipe,
        find: "current: { wheel: variant(Style.self({ '--_fk-spinner-ink': 'currentColor' })) },",
        replace:
          "current: { wheel: variant(Style.self({ '--_fk-spinner-ink': ref.accent.default })) },",
      },
    ],
    tests: browser,
  },
  {
    name: 'the words sit at the top of the row',
    edits: [
      {
        file: recipe,
        find: "        display: 'inline-flex',\n        alignItems: 'center',\n        gap: ref.space.xs,",
        replace:
          "        display: 'inline-flex',\n        alignItems: 'start',\n        gap: ref.space.xs,",
      },
    ],
    tests: browser,
  },
  {
    name: 'a ring and an orbit take the theme corner',
    edits: [
      {
        file: '../src/recipes/spinner.ts',
        find: "const round = '50%'",
        replace: 'const round = ref.radius.full',
      },
    ],
    tests: ['packages/mixins-ui/test/spinner.browser.test.ts'],
  },
]
