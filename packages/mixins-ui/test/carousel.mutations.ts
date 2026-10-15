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
        find: "slide?.scrollIntoView({ block: 'nearest', inline: 'start' })",
        replace: 'void slide',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a slide fills half the track',
    edits: [
      {
        file: '../src/recipes/carousel.ts',
        find: "flex: '0 0 var(--_fk-carousel-basis, 100%)',",
        replace: "flex: '0 0 50%',",
      },
    ],
    tests: [browser],
  },
]
