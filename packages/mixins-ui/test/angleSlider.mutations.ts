/**
 * The angle slider, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/angleSlider.mutations.ts` checks that
 * a test fails for every one.
 */
const unit = 'packages/mixins-ui/test/angleSlider.test.ts'
const browser = 'packages/mixins-ui/test/angleSlider.browser.test.ts'

export default [
  {
    name: 'a key steps from 0, not from the value update holds',
    edits: [
      {
        file: '../src/angleSlider.ts',
        find: 'valueAt(placeOf(value) + steps)',
        replace: 'valueAt(steps)',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the dial reads its angle from the bottom',
    edits: [
      {
        file: '../src/angleSlider.ts',
        find: '-(point.y - height / 2)',
        replace: 'point.y - height / 2',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the dial turns around its corner',
    edits: [{ file: '../src/angleSlider.ts', find: 'point.x - width / 2', replace: 'point.x' }],
    tests: [browser],
  },
  {
    name: 'a press on the dial leaves the focus where it was',
    edits: [
      {
        file: '../src/angleSlider.ts',
        find: `PointerPosition({ focus: '[role="slider"]' })`,
        replace: 'PointerPosition({})',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the release ends no turn',
    edits: [
      {
        file: '../src/angleSlider.ts',
        find: 'PointerReleased: () => Message.Released(),',
        replace: 'PointerReleased: () => Message.Set({ value: 0 }),',
      },
    ],
    tests: [browser],
  },
  {
    name: 'Page Down is left to scroll the page',
    edits: [{ file: '../src/angleSlider.ts', find: "  'PageDown',\n", replace: '' }],
    tests: [browser],
  },
  {
    name: 'the thumb is placed upside down',
    edits: [
      {
        file: '../src/recipes/angleSlider.ts',
        find: 'top: `calc(50% - cos(${degrees})',
        replace: 'top: `calc(50% + cos(${degrees})',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a marker the arc covers is drawn as one past it',
    edits: [
      {
        file: '../src/recipes/angleSlider.ts',
        find: "{ under: { background: toneVar('on-fill') }, at:",
        replace: '{ at:',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a point near the top snaps to the last step, not across to 0',
    edits: [
      {
        file: '../src/angleSlider.ts',
        find: 'return apart(0, degrees) < apart(grid, degrees) ? 0 : grid',
        replace: 'return grid',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the nearest mark is measured without going round',
    edits: [
      {
        file: '../src/angleSlider.ts',
        find: '  return Math.min(gap, 360 - gap)',
        replace: '  return gap',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a drag is not marked',
    edits: [
      {
        file: '../src/angleSlider.ts',
        find: 'Pointed: ({ angle }) => at(model, landed(angle), true)',
        replace: 'Pointed: ({ angle }) => at(model, landed(angle), false)',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a change of nothing makes a new Model',
    edits: [
      {
        file: '../src/angleSlider.ts',
        find: 'value === model.value && dragging === model.dragging',
        replace: 'false',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a read-only dial takes the keys',
    edits: [
      {
        file: '../src/angleSlider.ts',
        find: '...(readOnly\n                      ? [h.AriaReadonly(true)]',
        replace: '...(false\n                      ? [h.AriaReadonly(true)]',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the range ends a step before a turn even where the step does not divide it',
    edits: [
      {
        file: '../src/angleSlider.ts',
        find: 'h.AriaValuemax(lastOf(step))',
        replace: 'h.AriaValuemax(360 - step)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the large step is a single step',
    edits: [
      {
        file: '../src/angleSlider.ts',
        find: 'const by = shift ? large : 1',
        replace: 'const by = 1',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the needle runs from the center, through the value',
    edits: [
      {
        file: '../src/recipes/angleSlider.ts',
        find: 'blockSize: `calc(${radius} - 2em)`,',
        replace: 'blockSize: radius,',
      },
    ],
    tests: [browser],
  },
]
