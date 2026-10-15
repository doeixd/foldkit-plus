/**
 * The slider, one number and a range, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/slider.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/slider.test.ts'
const browser = 'packages/mixins-ui/test/slider.browser.test.ts'

export default [
  {
    name: 'a whole range input takes the pointer',
    edits: [
      {
        file: '../src/recipes/slider.ts',
        find: "pointerEvents: 'none',",
        replace: "pointerEvents: 'auto',",
      },
    ],
    tests: [browser],
  },
  {
    name: 'one thumb takes a press on its thumb only',
    edits: [
      {
        file: '../src/recipes/slider.ts',
        find: "pointerEvents: 'auto',\n        cursor: 'pointer',",
        replace: "cursor: 'pointer',",
      },
    ],
    tests: [browser],
  },
  {
    name: 'one thumb fills to its center, short of its far edge',
    edits: [
      {
        file: '../src/recipes/slider.ts',
        find: "insetInlineStart: '0',\n        inlineSize: `calc(${thumbSize} + ${travel} * ${high})`,\n        borderRadius",
        replace:
          "insetInlineStart: '0',\n        inlineSize: `calc(${thumbSize} / 2 + ${travel} * ${high})`,\n        borderRadius",
      },
    ],
    tests: [browser],
  },
  {
    name: 'met at the top, the low thumb stays under',
    edits: [
      {
        file: '../src/recipes/slider.ts',
        find: 'Style.nest(\'[data-raised="low"] > &[data-thumb="low"]\', { zIndex: \'1\' }),',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the low thumb is bounded by the top, not the high thumb',
    edits: [
      {
        file: '../src/slider.ts',
        find: '      to: range.high,',
        replace: '      to: bounds.max,',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'one thumb names itself with the label text instead of pointing at the label',
    edits: [
      {
        file: '../src/slider.ts',
        find: 'naming: h.AriaLabelledBy(labelId),',
        replace: 'naming: h.AriaLabel(labelId),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a mark below a range reads as filled',
    edits: [
      {
        file: '../src/slider.ts',
        find: 'at >= low && at <= high',
        replace: 'at <= high',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a shown value is read aloud beside the thumb that already says it',
    edits: [
      {
        file: '../src/slider.ts',
        find: '                    h.AriaHidden(true),\n',
        replace: '',
      },
    ],
    tests: [unit],
  },
]
