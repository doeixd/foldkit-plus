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
        find: 'h.Key(`value-${drawn.key}`),\n                    h.AriaHidden(true),',
        replace: 'h.Key(`value-${drawn.key}`),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a vertical control keeps the page’s writing mode',
    edits: [{ file: '../src/recipes/slider.ts', find: "writingMode: 'vertical-lr',", replace: '' }],
    tests: [browser],
  },
  {
    name: 'a vertical slider climbs from the top',
    edits: [{ file: '../src/recipes/slider.ts', find: "direction: 'rtl',", replace: '' }],
    tests: [browser],
  },
  {
    name: 'words on a vertical track lie on their side',
    edits: [
      {
        file: '../src/recipes/slider.ts',
        find: "const upright: Declarations = { writingMode: 'horizontal-tb' }",
        replace: 'const upright: Declarations = {}',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a vertical value sits on the labels’ side',
    edits: [
      {
        file: '../src/recipes/slider.ts',
        find: 'uprightAt({ right: `calc(100% + ${gap})` })',
        replace: 'uprightAt({ left: `calc(100% + ${gap})` })',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a vertical value keeps its height and centers off the thumb',
    edits: [
      {
        file: '../src/recipes/slider.ts',
        find: "Style.nest(vertical, { inlineSize: 'auto', blockSize: '0' }),",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the value at the end stays hidden',
    edits: [
      {
        file: '../src/recipes/slider.ts',
        find: "output: variant(Style.self({ display: 'inline' })),",
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'ticks are added up, and a fractional step loses its last',
    edits: [{ file: '../src/slider.ts', find: ' + 1e-9)', replace: ')' }],
    tests: [unit],
  },
  {
    name: 'a bare repeat of a value drops its label',
    edits: [
      {
        file: '../src/slider.ts',
        find: 'else if (!labels.has(mark)) labels.set(mark, Option.none())',
        replace: 'else labels.set(mark, Option.none())',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a marked step is drawn as a quiet tick',
    edits: [
      {
        file: '../src/slider.ts',
        find: "...(labels.has(at) ? [] : [h.DataAttribute('tick', '')]),",
        replace: "...[h.DataAttribute('tick', '')],",
      },
    ],
    tests: [unit],
  },
  {
    name: 'a vertical thumb says nothing of its orientation',
    edits: [
      {
        file: '../src/slider.ts',
        find: "...(vertical ? [h.AriaOrientation('vertical')] : []),",
        replace: '',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the end labels hang past the track',
    edits: [{ file: '../src/slider.ts', find: '...edgeOf(share(at, min, max)),', replace: '' }],
    tests: [browser],
  },
  {
    name: 'the last label is taken for the first',
    edits: [
      {
        file: '../src/slider.ts',
        find: "if (at === 1) return [h.DataAttribute('edge', 'end')]",
        replace: "if (at === 1) return [h.DataAttribute('edge', 'start')]",
      },
    ],
    tests: [browser],
  },
  {
    name: 'an end label keeps to its physical left',
    edits: [
      {
        file: '../src/recipes/slider.ts',
        find: "        insetInlineStart: 'auto',\n        insetInlineEnd: '0',",
        replace: "        insetInlineStart: 'auto',\n        right: '0',",
      },
    ],
    tests: [browser],
  },
]
