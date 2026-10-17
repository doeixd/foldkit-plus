/**
 * The thinking indicator, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/thinkingIndicator.mutations.ts` checks
 * that a test fails for every one.
 */
const unit = ['packages/mixins-ui/test/thinkingIndicator.test.ts']
const browser = ['packages/mixins-ui/test/thinkingIndicator.browser.test.ts']
const view = '../src/thinkingIndicator.ts'
const recipe = '../src/recipes/thinkingIndicator.ts'

export default [
  {
    name: 'idle, the region is gone',
    edits: [
      {
        file: view,
        find: 'if (options.active === false) return h.div(root, [])',
        replace: 'if (options.active === false) return h.empty',
      },
    ],
    tests: unit,
  },
  {
    name: 'the mark is read aloud',
    edits: [
      {
        file: view,
        find: 'builders.mark.attrs([h.AriaHidden(true)])',
        replace: 'builders.mark.attrs()',
      },
    ],
    tests: unit,
  },
  {
    name: 'the icon is drawn beside the dots',
    edits: [
      {
        file: view,
        find: '        : [h.span(builders.icon.attrs(), [icon])],',
        replace:
          '        : [h.span(builders.icon.attrs(), [icon]), ...Array.from({ length: DOTS }, () => h.span(builders.dot.attrs(), []))],',
      },
    ],
    tests: unit,
  },
  {
    name: 'the detail is drawn outside a Slot',
    edits: [
      {
        file: view,
        find: 'h.span(builders.detail.attrs(), [detail])',
        replace: 'h.span([], [detail])',
      },
    ],
    tests: unit,
  },
  {
    name: 'the sweep ignores travel',
    edits: [
      {
        file: recipe,
        find: 'animation: `${sweep.name} ${travelled(`calc(${ref.motion.slow} * 8)`)} linear infinite`,',
        replace: 'animation: `${sweep.name} calc(${ref.motion.slow} * 8) linear infinite`,',
      },
    ],
    tests: browser,
  },
  {
    name: 'the sweep runs under reduced motion',
    edits: [
      {
        file: recipe,
        find: "  Style.nest('&:dir(rtl)', { animationDirection: 'reverse' }),\n  still,\n)",
        replace: "  Style.nest('&:dir(rtl)', { animationDirection: 'reverse' }),\n)",
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'the sweep runs the same way right to left',
    edits: [
      {
        file: recipe,
        find: "  Style.nest('&:dir(rtl)', { animationDirection: 'reverse' }),\n",
        replace: '',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'held, the band rests on the words',
    edits: [
      {
        file: recipe,
        find: "  to: { backgroundPosition: '0% 0' },",
        replace: "  to: { backgroundPosition: '60% 0' },",
      },
      {
        file: recipe,
        find: "  from: { backgroundPosition: '100% 0' },",
        replace: "  from: { backgroundPosition: '60% 0' },",
      },
      {
        file: recipe,
        find: "    backgroundRepeat: 'no-repeat',\n    backgroundClip",
        replace:
          "    backgroundRepeat: 'no-repeat',\n    backgroundPosition: '60% 0',\n    backgroundClip",
      },
    ],
    tests: browser,
  },
  {
    name: 'the dots rise together',
    edits: [
      {
        file: recipe,
        find: "          Style.nest('&:nth-child(2)', { animationDelay: `calc(${cycle} / 6)` }),\n",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'the dots ignore travel',
    edits: [
      {
        file: recipe,
        find: 'const cycle = travelled(`calc(${ref.motion.slow} * 3)`)',
        replace: 'const cycle = `calc(${ref.motion.slow} * 3)`',
      },
    ],
    tests: browser,
  },
  {
    name: 'the dots rise under reduced motion',
    edits: [
      {
        file: recipe,
        find: "          Style.nest('&:nth-child(3)', { animationDelay: `calc(${cycle} / 3)` }),\n          still,",
        replace:
          "          Style.nest('&:nth-child(3)', { animationDelay: `calc(${cycle} / 3)` }),",
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'a pulse draws every dot',
    edits: [
      { file: recipe, find: "          Style.nest('& + &', { display: 'none' }),\n", replace: '' },
    ],
    tests: browser,
  },
  {
    name: 'the dots sit at the top of the line',
    edits: [
      {
        file: recipe,
        find: "        flexWrap: 'wrap',\n        alignItems: 'center',",
        replace: "        flexWrap: 'wrap',\n        alignItems: 'start',",
      },
    ],
    tests: browser,
  },
  {
    name: 'the detail shares the words’ line',
    edits: [
      {
        file: recipe,
        find: "flexBasis: '100%', color",
        replace: 'color',
      },
    ],
    tests: browser,
  },
  {
    name: 'hidden words are shown',
    edits: [
      {
        file: recipe,
        find: '      hidden: { label: variant(Utilities.srOnly) },',
        replace: '      hidden: {},',
      },
    ],
    tests: browser,
  },
  {
    name: 'the accent tone is muted',
    edits: [
      {
        file: recipe,
        find: "            '--_fk-thinking-ink': ref.accent.ink,\n",
        replace: '',
      },
    ],
    tests: browser,
  },
]
