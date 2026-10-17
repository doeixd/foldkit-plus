/**
 * The color picker, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/colorPicker.mutations.ts` checks that
 * a test fails for every one.
 */
const unit = 'packages/mixins-ui/test/colorPicker.test.ts'
const browser = 'packages/mixins-ui/test/colorPicker.browser.test.ts'

export default [
  {
    name: 'an area key moves from the middle, not from the color update holds',
    edits: [
      {
        file: '../src/colorPicker.ts',
        find: 's: round(clamp(current.s + step.s), 4),',
        replace: 's: round(clamp(0.5 + step.s), 4),',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'the area reads brightness down instead of up',
    edits: [
      {
        file: '../src/colorPicker.ts',
        find: 'v: clamp(1 - y)',
        replace: 'v: clamp(y)',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a press on the area leaves the focus where it was',
    edits: [
      {
        file: '../src/colorPicker.ts',
        find: 'if (thumb instanceof HTMLElement) thumb.focus()',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the area follows the pointer after it is released',
    edits: [
      {
        file: '../src/colorPicker.ts',
        find: '            pointer = undefined\n',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'Page Down is left to scroll the page',
    edits: [{ file: '../src/colorPicker.ts', find: "  'PageDown',\n", replace: '' }],
    tests: [browser],
  },
  {
    name: 'a draft that names no color stays',
    edits: [
      {
        file: '../src/colorPicker.ts',
        find: 'onNone: () => ({ model: dropped }),',
        replace: 'onNone: () => ({ model }),',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a grey takes hue 0',
    edits: [
      {
        file: '../src/colorPicker.ts',
        find: '    delta === 0\n      ? hue\n',
        replace: '    delta === 0\n      ? 0\n',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the eyedropper drops the alpha',
    edits: [
      {
        file: '../src/colorPicker.ts',
        find: 'onSome: picked => withColor(model, { ...picked, alpha: current.alpha }),',
        replace: 'onSome: picked => withColor(model, picked),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'an unchanged color makes a new Model',
    edits: [
      {
        file: '../src/colorPicker.ts',
        find: 'next.alpha === model.color.alpha\n    ? { model }',
        replace: 'next.alpha === model.color.alpha\n    ? { model: { ...model } }',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a percent alpha reads as a fraction of one',
    edits: [
      {
        file: '../src/colorPicker.ts',
        find: "unit === '%' ? Number(text) / 100 : Number(text) / whole",
        replace: 'Number(text) / whole',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the thumb sits on the brightness across',
    edits: [
      {
        file: '../src/recipes/colorPicker.ts',
        find: "left: 'calc(var(--fk-color-x) * 100%)',",
        replace: "left: 'calc(var(--fk-color-y) * 100%)',",
      },
    ],
    tests: [browser],
  },
  {
    name: 'right to left, the tracks still run from the left',
    edits: [
      {
        file: '../src/recipes/colorPicker.ts',
        find: "{ '--fk-slider-paint': rtl[key] }",
        replace: "{ '--fk-slider-paint': ltr[key] }",
      },
    ],
    tests: [browser],
  },
  {
    name: 'alpha shows over nothing',
    edits: [
      {
        file: '../src/recipes/colorPicker.ts',
        find: 'alpha: `linear-gradient(to ${toward}, transparent, var(--fk-color-opaque)), ${checker}`,',
        replace: 'alpha: `linear-gradient(to ${toward}, transparent, var(--fk-color-opaque))`,',
      },
    ],
    tests: [browser],
  },
]
