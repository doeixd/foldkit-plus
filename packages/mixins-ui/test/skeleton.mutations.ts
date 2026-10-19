/**
 * The skeleton, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/skeleton.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = ['packages/mixins-ui/test/skeleton.test.ts']
const browser = ['packages/mixins-ui/test/skeleton.browser.test.ts']
const view = '../src/skeleton.ts'
const recipe = '../src/recipes/skeleton.ts'

export default [
  {
    name: 'a bar has no floor, so it vanishes where its container sizes to content',
    edits: [{ file: recipe, find: "minInlineSize: '4rem',", replace: '' }],
    tests: browser,
  },
  {
    name: 'a bar keeps to its floor, so it does not fill its container',
    edits: [
      {
        file: recipe,
        find: "Style.nest(lone, { inlineSize: '100%', minInlineSize: '4rem', blockSize: '1rem' }),",
        replace:
          "Style.nest(lone, { inlineSize: '4rem', minInlineSize: '4rem', blockSize: '1rem' }),",
      },
    ],
    tests: browser,
  },
  {
    name: 'every bar interrupts',
    edits: [{ file: view, find: "h.Role('status')", replace: "h.Role('alert')" }],
    tests: unit,
  },
  {
    name: 'circles come out square',
    edits: [
      {
        file: recipe,
        find: "          Style.nest(lone, {\n            inlineSize: '2.5rem',\n            blockSize: '2.5rem',\n            borderRadius: ref.radius.full,",
        replace:
          "          Style.nest(lone, {\n            inlineSize: '2.5rem',\n            blockSize: '2.5rem',\n            borderRadius: ref.radius.sm,",
      },
    ],
    tests: unit,
  },
  {
    name: 'a bar is the muted surface, sunken on a dark page',
    edits: [
      {
        file: recipe,
        find: '      Style.self({ background: fill, borderRadius: ref.radius.sm }),',
        replace:
          '      Style.self({ background: ref.surface.muted, borderRadius: ref.radius.sm }),',
      },
    ],
    tests: browser,
  },
  {
    name: 'the bars of a frame are each a status',
    edits: [{ file: view, find: '          h.AriaHidden(true),\n', replace: '' }],
    tests: unit,
  },
  {
    name: 'every line ends early',
    edits: [
      {
        file: view,
        find: 'short: options.lines > 1 && index === options.lines - 1,',
        replace: 'short: true,',
      },
    ],
    tests: [...unit, ...browser],
  },
  {
    name: 'a frame takes the lone bar’s shape',
    edits: [
      {
        file: recipe,
        find: 'const lone = \'&:not([aria-hidden="true"])\'',
        replace: "const lone = '&'",
      },
    ],
    tests: browser,
  },
  {
    name: 'the avatar row stacks its circle over its lines',
    edits: [
      { file: recipe, find: "        gridTemplateColumns: 'auto minmax(0, 1fr)',\n", replace: '' },
    ],
    tests: browser,
  },
  {
    name: 'a table row stacks its cells',
    edits: [
      {
        file: recipe,
        find: "gridTemplateColumns: 'repeat(var(--fk-skeleton-columns), minmax(0, 1fr))',",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'the shimmer ignores travel',
    edits: [
      {
        file: recipe,
        find: '${travelled(`calc(${ref.motion.slow} * 6)`)}',
        replace: '${ref.motion.slow}',
      },
    ],
    tests: browser,
  },
  {
    name: 'the shimmer sweeps one way in both directions',
    edits: [
      {
        file: recipe,
        find: "Style.nest('&:dir(rtl)', { animationDirection: 'reverse' }),",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'the shimmer moves under reduced motion',
    edits: [
      {
        file: recipe,
        find: "          Style.nest('&:dir(rtl)', { animationDirection: 'reverse' }),\n          still,",
        replace: "          Style.nest('&:dir(rtl)', { animationDirection: 'reverse' }),",
      },
    ],
    tests: unit,
  },
  {
    name: 'a bar takes the light scheme tint in both schemes',
    edits: [
      {
        file: '../src/recipes/skeleton.ts',
        find: 'const fill = ref.state.tint',
        replace:
          "const fill = `color-mix(in oklab, currentColor ${ref.knob['state-tint']}, transparent)`",
      },
    ],
    tests: ['packages/mixins-ui/test/skeleton.browser.test.ts'],
  },
]
