/**
 * The icon, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/icon.mutations.ts` checks that a
 * test fails for every one.
 */
const tests = ['packages/mixins-ui/test/icon.test.ts']
const ssr = ['packages/mixins-ui/test/icon.ssr.test.ts']
const browser = ['packages/mixins-ui/test/icon.browser.test.ts']
// `Icon.draw` lives in foldkit-media; these tests are where its drawing is rendered.
const drawing = '../../media/src/icon.ts'

export default [
  {
    name: 'a decorative icon is announced',
    edits: [
      {
        file: '../src/icon.ts',
        find: 'builders.glyph.attrs([h.AriaHidden(true)])',
        replace: 'builders.glyph.attrs([])',
      },
    ],
    tests,
  },
  {
    name: 'a drawing is announced',
    edits: [{ file: drawing, find: '      h.AriaHidden(true),', replace: '' }],
    tests: ssr,
  },
  {
    name: 'a drawing keeps its own ids',
    edits: [{ file: drawing, find: 'prefixIds(icon, prefix)', replace: 'icon' }],
    tests: ssr,
  },
  {
    name: 'a key parts no copies',
    edits: [
      {
        file: drawing,
        find: "(options.key === undefined ? '' : `-${options.key}`)",
        replace: "''",
      },
    ],
    tests: ssr,
  },
  {
    name: 'a drawing alone has no size',
    edits: [
      {
        file: drawing,
        find: "const size = options.size ?? '1em'",
        replace: "const size = options.size ?? ''",
      },
    ],
    tests: browser,
  },
  {
    name: 'a drawing shrinks in a squeezed row',
    edits: [{ file: drawing, find: "h.Attribute('style', 'flex-shrink: 0'),", replace: '' }],
    tests: browser,
  },
  {
    name: 'a drawing in a glyph keeps its own size',
    edits: [
      {
        file: '../src/recipes/icon.ts',
        find: "Style.nest('& > svg', { inlineSize: '100%', blockSize: '100%' }),",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'a pack’s strokes are not redrawn',
    edits: [
      {
        file: '../src/icons.ts',
        find: 'Icon.maskUrl(Icon.withStroke(drawn, stroke))',
        replace: 'Icon.maskUrl(drawn)',
      },
    ],
    tests: ['packages/mixins-ui/test/iconTokens.test.ts'],
  },
  {
    name: 'the icon size knob sizes nothing',
    edits: [
      {
        file: '../../mixins/src/theme/tokens.ts',
        find: '? `calc(${stepped} * var(--fk-knob-icon-scale))`',
        replace: '? stepped',
      },
    ],
    tests: browser,
  },
  {
    name: 'the glyph stroke knob strokes nothing',
    edits: [
      {
        file: '../../mixins/src/theme/tokens.ts',
        find: "glyph: 'var(--fk-knob-glyph-width)',",
        replace: "glyph: '2px',",
      },
    ],
    tests: browser,
  },
  {
    name: 'two keyed copies of one icon share their ids',
    edits: [
      {
        file: '../src/icon.ts',
        find: 'options.key === undefined ? {} : { key: options.key }',
        replace: '{}',
      },
    ],
    tests,
  },
]
