/**
 * The carousel, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/carousel.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/carousel.test.ts'
const browser = 'packages/mixins-ui/test/carousel.browser.test.ts'

export default [
  {
    name: 'ShowSlide scrolls nothing',
    edits: [
      {
        file: '../src/carousel.ts',
        find: "?.scrollIntoView({ block: 'nearest', inline: 'start' })",
        replace: '?.focus()',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a slide fills half the track',
    edits: [
      {
        file: '../src/recipes/carousel.ts',
        find: 'flex: `0 0 calc((var(--_fk-carousel-span, 100%) - (${perView} - 1) * ${gap}) / ${perView})`,',
        replace: "flex: '0 0 50%',",
      },
    ],
    tests: [browser],
  },
  {
    name: 'slides per view leave no gap between them',
    edits: [
      {
        file: '../src/recipes/carousel.ts',
        find: '(${perView} - 1) * ${gap}',
        replace: '(${perView} - 1) * 0px',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a place per slide, however many show',
    edits: [
      {
        file: '../src/carousel.ts',
        find: 'Math.max(1, count - Math.max(1, Math.floor(perView)) + 1)',
        replace: 'Math.max(1, count)',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the track is not heard',
    edits: [{ file: '../src/carousel.ts', find: ', h.OnMount(settle)]', replace: ']' }],
    tests: [browser],
  },
  {
    name: 'a settled swipe is ignored',
    edits: [
      {
        file: '../src/carousel.ts',
        find: 'return at === model.index ? counted(model) : shown(model, at, false)',
        replace: 'return counted(model)',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the track starts at the first slide whatever the Model says',
    edits: [
      {
        file: '../src/carousel.ts',
        find: 'ScrollSettle({ start: current })',
        replace: 'ScrollSettle({})',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a stale wait moves it on',
    edits: [
      {
        file: '../src/carousel.ts',
        find: 'if (turn !== model.turn || !model.counting || !running(model)) return { model }',
        replace: 'if (!model.counting || !running(model)) return { model }',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the pointer does not pause it',
    edits: [
      {
        file: '../src/carousel.ts',
        find: "const running = (model: Model): boolean => model.rotation === 'Rotating' && !model.hovered",
        replace: "const running = (model: Model): boolean => model.rotation === 'Rotating'",
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'focus from the keys does not stop it',
    edits: [
      {
        file: '../src/carousel.ts',
        find: "model.rotation === 'Rotating' && !model.hovered\n          ? { model: modifyFields(model, { rotation: () => 'Stopped', counting: () => false }) }",
        replace:
          "false\n          ? { model: modifyFields(model, { rotation: () => 'Stopped', counting: () => false }) }",
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'focus under the pointer stops it too',
    edits: [
      {
        file: '../src/carousel.ts',
        find: "model.rotation === 'Rotating' && !model.hovered\n          ? { model: modifyFields(model, { rotation: () => 'Stopped', counting: () => false }) }",
        replace:
          "model.rotation === 'Rotating'\n          ? { model: modifyFields(model, { rotation: () => 'Stopped', counting: () => false }) }",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the last slide rotates to the first without looping',
    edits: [
      {
        file: '../src/carousel.ts',
        find: 'if (model.index >= last && !loop) {',
        replace: 'if (false) {',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the status speaks while it rotates',
    edits: [
      {
        file: '../src/carousel.ts',
        find: "h.Attribute('aria-live', model.rotation === 'Rotating' ? 'off' : 'polite'),",
        replace: "h.Attribute('aria-live', 'polite'),",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the fill does not hold under the pointer',
    edits: [
      {
        file: '../src/recipes/carousel.ts',
        find: "{ animationPlayState: 'paused' }",
        replace: "{ animationPlayState: 'running' }",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the current dot never fills',
    edits: [
      {
        file: '../src/recipes/carousel.ts',
        find: "filling('even', fills[0].name),",
        replace: '',
      },
    ],
    tests: [browser],
  },
]
