/**
 * The empty state, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/empty.mutations.ts` checks that a test
 * fails for every one.
 */
const unit = ['packages/mixins-ui/test/empty.test.ts']
const browser = ['packages/mixins-ui/test/empty.browser.test.ts']
const view = '../src/empty.ts'
const recipe = '../src/recipes/empty.ts'

export default [
  {
    name: 'empty states left-align',
    edits: [{ file: recipe, find: "textAlign: 'center',", replace: "textAlign: 'start'," }],
    tests: [...unit, ...browser],
  },
  {
    name: 'icons go missing',
    edits: [
      {
        file: view,
        find: ': [h.div(builders.icon.attrs([h.AriaHidden(true)]), [options.icon])]),',
        replace: ': []),',
      },
    ],
    tests: unit,
  },
  {
    name: 'the picture is read aloud',
    edits: [
      {
        file: view,
        find: 'builders.icon.attrs([h.AriaHidden(true)])',
        replace: 'builders.icon.attrs()',
      },
    ],
    tests: unit,
  },
  {
    name: 'the icon is as loud as the title',
    edits: [
      {
        file: recipe,
        find: "        marginBlockEnd: ref.space['2xs'],\n        color: ref.text.muted,",
        replace: "        marginBlockEnd: ref.space['2xs'],\n        color: ref.text.overt,",
      },
    ],
    tests: browser,
  },
  {
    name: 'the dashed frame is solid',
    edits: [
      {
        file: recipe,
        find: '${ref.border.thin} dashed ${ref.outline.default}',
        replace: '${ref.border.thin} solid ${ref.outline.default}',
      },
    ],
    tests: browser,
  },
  {
    name: 'a failed load looks like any other',
    edits: [{ file: recipe, find: 'color: ref.error.ink,', replace: '' }],
    tests: browser,
  },
  {
    name: 'an illustration keeps the disc',
    edits: [
      {
        file: recipe,
        find: "        icon: variant(Style.nest('& > :is(svg, img)', { inlineSize: '8rem', blockSize: 'auto' })),",
        replace:
          "        icon: variant(\n          Style.self({ inlineSize: '3rem', blockSize: '3rem', background: ref.surface.muted }),\n        ),",
      },
    ],
    tests: browser,
  },
]
