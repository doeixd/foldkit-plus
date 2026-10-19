/**
 * The marquee, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/marquee.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/marquee.test.ts'
const browser = 'packages/mixins-ui/test/marquee.browser.test.ts'

export default [
  {
    name: 'the copies are read and reached like the first',
    edits: [{ file: '../src/marquee.ts', find: "h.Attribute('inert', ''),", replace: '' }],
    tests: [unit],
  },
  {
    name: 'no copy is drawn past the viewport',
    edits: [
      {
        file: '../src/marquee.ts',
        find: 'Math.ceil(model.viewport / model.content) + 1',
        replace: 'Math.ceil(model.viewport / model.content)',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a round is timed without the speed',
    edits: [
      {
        file: '../src/marquee.ts',
        find: '(model.content / speed).toFixed(3)',
        replace: '(model.content / 50).toFixed(3)',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a vertical marquee is measured across',
    edits: [
      {
        file: '../src/marquee.ts',
        find: 'vertical ? fact.height : fact.width',
        replace: 'fact.width',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the last copy and the next meet with no space between',
    edits: [
      {
        file: '../src/recipes/marquee.ts',
        find: "Style.pseudo('::after', { content: '\"\"', flex: 'none' }),",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'right to left it moves leftward',
    edits: [
      {
        file: '../src/recipes/marquee.ts',
        find: "Style.pseudo(':dir(rtl)', { '--_fk-marquee-way': '-1' }),",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'it moves the other way when asked for the end',
    edits: [
      {
        file: '../src/recipes/marquee.ts',
        find: "animationDirection: 'reverse',",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a pointer or focus does not hold it',
    edits: [
      {
        file: '../src/recipes/marquee.ts',
        find: '[data-pause-on-interaction]:is(:hover, :focus-within)',
        replace: '[data-never]',
      },
    ],
    tests: [browser],
  },
  {
    name: 'its distance does not travel',
    edits: [
      {
        file: '../src/recipes/marquee.ts',
        find: '`calc(var(--_fk-marquee-way) * -100% * ${ref.knob.travel}) 0`',
        replace: '`calc(var(--_fk-marquee-way) * -100%) 0`',
      },
    ],
    tests: [browser],
  },
  {
    name: 'reduced motion shows every copy over a clipped viewport',
    edits: [
      {
        file: '../src/recipes/marquee.ts',
        find: "Style.media('(prefers-reduced-motion: reduce)', { overflow: 'auto' }),",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the motion knob does not reach its duration',
    edits: [
      {
        file: '../src/recipes/marquee.ts',
        find: '`calc(var(--fk-marquee-duration, 20s) * ${ref.knob.motion})',
        replace: '`calc(var(--fk-marquee-duration, 20s))',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the pause press says what it is, not what it will do',
    edits: [
      {
        file: '../src/marquee.ts',
        find: 'h.AriaLabel(model.paused ? labels.play : labels.pause)',
        replace: 'h.AriaLabel(model.paused ? labels.pause : labels.play)',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a size measured again makes a new Model',
    edits: [
      {
        file: '../src/marquee.ts',
        find: 'size === model.content ? { model }',
        replace: 'false ? { model }',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a vertical marquee stands taller than its container',
    edits: [
      {
        file: '../src/recipes/marquee.ts',
        find: "blockSize: '16rem', maxBlockSize: '100%'",
        replace: "blockSize: '16rem'",
      },
    ],
    tests: [browser],
  },
]
