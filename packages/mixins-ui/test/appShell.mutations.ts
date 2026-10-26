/**
 * The frame, broken in turn: `pnpm mutate packages/mixins-ui/test/appShell.mutations.ts`.
 */
const view = '../src/appShell.ts'
const recipe = '../src/recipes/appShell.ts'
const unit = 'packages/mixins-ui/test/appShell.test.ts'
const served = 'packages/mixins-ui/test/appShell.ssr.test.ts'
const browser = 'packages/mixins-ui/test/appShell.browser.test.ts'

export default [
  {
    name: 'the skip link goes nowhere',
    edits: [{ file: view, find: 'h.Href(`#${mainId}`)', replace: "h.Href('#')" }],
    tests: [unit, served],
  },
  {
    name: 'the main region cannot take the skip link’s focus',
    edits: [{ file: view, find: '[h.Id(mainId), h.Tabindex(-1)]', replace: '[h.Id(mainId)]' }],
    tests: [unit, served, browser],
  },
  {
    name: 'the frame never says it has a side column',
    edits: [{ file: view, find: "sided ? [h.DataAttribute('side', '')] : []", replace: '[]' }],
    tests: [unit, browser],
  },
  {
    name: 'the brand’s mark is read out',
    edits: [
      {
        file: view,
        find: 'builders.mark.attrs([h.AriaHidden(true)])',
        replace: 'builders.mark.attrs()',
      },
    ],
    tests: [unit],
  },
  {
    name: 'an empty footer is drawn',
    edits: [
      {
        file: view,
        find: 'options.footer === undefined || options.footer.length === 0',
        replace: 'options.footer === undefined',
      },
    ],
    tests: [unit],
  },
  {
    name: 'on a phone the side column keeps its own column',
    edits: [
      {
        file: recipe,
        find: `gridTemplateAreas: '"side header" "main main" "footer footer"',`,
        replace: `gridTemplateAreas: '"side header" "side main" "side footer"',`,
      },
    ],
    tests: [browser],
  },
  {
    name: 'the side column is only as tall as what it holds',
    edits: [{ file: recipe, find: "        blockSize: '100dvh',\n", replace: '' }],
    tests: [browser],
  },
  {
    name: 'the header scrolls away',
    edits: [
      {
        file: recipe,
        find: "        position: 'sticky',\n        insetBlockStart: '0',\n        // Above positioned",
        replace: '        // Above positioned',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the skip link is always in sight',
    edits: [
      {
        file: recipe,
        find: 'transform: `translateY(calc(-100% - 2 * ${ref.space.xs}))`,',
        replace: '',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the header lies under the page scrolled beneath it',
    edits: [
      {
        file: recipe,
        find: "        zIndex: '1',\n        display: 'flex',",
        replace: "        display: 'flex',",
      },
    ],
    tests: [browser],
  },
  {
    name: 'the skip link shows under the header',
    edits: [{ file: recipe, find: "zIndex: '2',", replace: "zIndex: '1'," }],
    tests: [browser],
  },
]
